import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRayuAuth } from './rayu-auth';
import { deployAction, deployStatus } from './studio-deploy';

vi.mock('./rayu-auth', () => ({
  getRayuAuth: vi.fn(),
  backendApiBase: () => 'https://backend.test/api',
  publicOrigin: (request: Request) => new URL(request.url).origin,
  appendAuthCookies: (headers: Headers) => headers,
}));

beforeEach(() => {
  vi.mocked(getRayuAuth).mockResolvedValue({
    accessToken: 'owner-session',
    user: { id: 42, email: null, displayName: null, avatarUrl: null },
    setCookies: [],
  });
});
afterEach(() => vi.unstubAllGlobals());

function args(body: unknown, origin = 'https://studio.test') {
  return {
    request: new Request('https://studio.test/api/netlify-deploy', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: {},
    context: {},
  } as any;
}

describe('hosted Studio deployments', () => {
  it.each(['netlify', 'vercel'] as const)(
    'forwards %s files using the Rayu session, without a provider token',
    async (provider) => {
      const providerFetch = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ deployId: 'dpl-1', url: 'https://site.test' }));
      vi.stubGlobal('fetch', providerFetch);

      expect(
        (
          await deployAction(
            provider,
            args({ expectedUserId: 42, files: { '/index.html': 'hi' }, binaryFiles: { '/logo.png': 'AA==' } }),
          )
        ).status,
      ).toBe(200);

      const [url, init] = providerFetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`https://backend.test/api/studio/deploy/${provider}`);
      expect(init.headers).toMatchObject({ Authorization: 'Bearer owner-session' });
      expect(JSON.parse(String(init.body))).toEqual({
        files: { 'index.html': 'hi' },
        binaryFiles: { 'logo.png': 'AA==' },
      });
    },
  );

  it('rejects anonymous deployments and cross-site requests before contacting the backend', async () => {
    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', providerFetch);
    vi.mocked(getRayuAuth).mockResolvedValue(null);

    expect((await deployAction('netlify', args({}))).status).toBe(401);
    expect((await deployAction('netlify', args({}, 'https://other.test'))).status).toBe(403);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('rejects credential injection and account switches during a build', async () => {
    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', providerFetch);

    expect((await deployAction('netlify', args({ expectedUserId: 42, token: 'shared-secret' }))).status).toBe(400);
    expect((await deployAction('netlify', args({ expectedUserId: 43, files: { 'index.html': 'hi' } }))).status).toBe(
      409,
    );
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('polls status with the session rather than a token in the URL', async () => {
    const providerFetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ state: 'ready' }));
    vi.stubGlobal('fetch', providerFetch);

    const response = await deployStatus('netlify', {
      request: new Request('https://studio.test/api/netlify-deploy?id=dpl-1'),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(200);
    expect(providerFetch.mock.calls[0][0]).toBe(
      'https://backend.test/api/studio/deploy/status?id=dpl-1&provider=netlify',
    );
  });
});
