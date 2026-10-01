import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubTokenForRequest } from './github';
import { loader as githubUserLoader } from '~/routes/api.github-user';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const withCookieKeys = (keys?: Record<string, string>) =>
  new Request('https://studio.example.com/api/github-user', {
    headers: {
      ...(keys ? { Cookie: `apiKeys=${encodeURIComponent(JSON.stringify(keys))}` } : {}),

      // A fresh client address per request keeps withSecurity's rate limiter out of the way.
      'X-Forwarded-For': `198.51.100.${Math.floor(Math.random() * 250)}`,
    },
  });

describe('githubTokenForRequest', () => {
  it("uses the caller's own saved token first", () => {
    expect(githubTokenForRequest(withCookieKeys({ VITE_GITHUB_ACCESS_TOKEN: 'user-token' }))).toBe('user-token');
    expect(githubTokenForRequest(withCookieKeys({ GITHUB_API_KEY: 'models-token' }))).toBe('models-token');
  });

  it("never falls back to the server's template GITHUB_TOKEN", () => {
    vi.stubEnv('GITHUB_TOKEN', 'server-process-token');

    const context = { cloudflare: { env: { GITHUB_TOKEN: 'server-template-token' } } };

    expect(githubTokenForRequest(withCookieKeys(), context)).toBe('');
  });

  it('keeps the single-user VITE_GITHUB_ACCESS_TOKEN fallback', () => {
    const context = { cloudflare: { env: { VITE_GITHUB_ACCESS_TOKEN: 'self-hosted-token' } } };

    expect(githubTokenForRequest(withCookieKeys(), context)).toBe('self-hosted-token');
  });
});

describe('GitHub user route', () => {
  it("does not show an anonymous visitor the server token's GitHub account", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(Response.json({ login: 'operator' }));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await githubUserLoader({
      request: withCookieKeys(),
      context: { cloudflare: { env: { GITHUB_TOKEN: 'server-template-token' } } },
      params: {},
    } as any);

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
