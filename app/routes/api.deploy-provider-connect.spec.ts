import { afterEach, describe, expect, it, vi } from 'vitest';
import { action } from './api.deploy-provider-connect';

vi.mock('~/lib/.server/rayu-auth', () => ({
  getRayuAuth: vi.fn(async () => ({ accessToken: 'rayu-token', user: { id: 1 }, setCookies: [] })),
  publicOrigin: (request: Request) => new URL(request.url).origin,
  appendAuthCookies: (headers: Headers) => headers,
}));

afterEach(() => vi.unstubAllGlobals());

function connect(provider: string, token: string, origin = 'https://studio.rayucode.com') {
  return action({
    request: new Request('https://studio.rayucode.com/api/deploy-provider-connect', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, token }),
    }),
    context: { cloudflare: { env: {} } },
    params: {},
  } as any);
}

describe('deploy provider connection check', () => {
  it('rejects cross-origin requests without contacting the provider', async () => {
    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', providerFetch);

    expect((await connect('netlify', 'token', 'https://evil.example')).status).toBe(403);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('returns an actionable error for an invalid token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    const response = await connect('netlify', 'bad-token');

    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toContain('rejected this token');
  });

  it('normalizes Vercel account responses and never returns the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ user: { id: 'user-1', username: 'rayu' } })),
    );

    const response = await connect('vercel', 'secret-token');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ user: { id: 'user-1', username: 'rayu' } });
    expect(JSON.stringify(body)).not.toContain('secret-token');
  });
});
