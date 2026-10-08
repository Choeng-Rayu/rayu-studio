import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action, loader } from './api.deploy-provider-connect';
import { getRayuAuth } from '~/lib/.server/rayu-auth';

vi.mock('~/lib/.server/rayu-auth', () => ({
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

function connect(provider: string, token: string, origin = 'https://studio.rayucode.com') {
  return action({
    request: new Request('https://studio.rayucode.com/api/deploy-provider-connect', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, token }),
    }),
    context: {},
    params: {},
  } as any);
}

describe('account deployment connections', () => {
  it('rejects cross-origin requests without contacting the provider', async () => {
    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', providerFetch);

    expect((await connect('netlify', 'token', 'https://evil.example')).status).toBe(403);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('returns an actionable error without saving rejected credentials', async () => {
    const providerFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', providerFetch);

    const response = await connect('netlify', 'bad-token');

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain('rejected this token');
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });

  it('saves credentials only under the authenticated Rayu account and returns metadata', async () => {
    const providerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ user: { id: 'u-1', username: 'rayu' } }))
      .mockResolvedValueOnce(Response.json({ kind: 'vercel', maskedToken: 'masked', meta: { username: 'rayu' } }));
    vi.stubGlobal('fetch', providerFetch);

    const response = await connect('vercel', 'secret-token');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      userId: 42,
      connection: { kind: 'vercel', maskedToken: 'masked', meta: { username: 'rayu' } },
    });
    expect(JSON.stringify(body)).not.toContain('secret-token');

    const [url, init] = providerFetch.mock.calls[1];
    expect(url).toBe('https://backend.test/api/studio/connections/vercel');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer owner-session' });
    expect(JSON.parse(String(init?.body))).toEqual({ token: 'secret-token', meta: { id: 'u-1', username: 'rayu' } });
  });

  it('loads only the signed-in account connection records', async () => {
    const providerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([{ kind: 'netlify', maskedToken: 'masked', meta: {} }]));
    vi.stubGlobal('fetch', providerFetch);

    const response = await loader({
      request: new Request('https://studio.rayucode.com/api/deploy-provider-connect'),
      context: {},
      params: {},
    } as any);

    expect(await response.json()).toMatchObject({ userId: 42 });
    expect(providerFetch.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer owner-session' });
  });

  it('does not contact providers while signed out', async () => {
    vi.mocked(getRayuAuth).mockResolvedValue(null);

    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', providerFetch);

    expect((await connect('netlify', 'secret-token')).status).toBe(401);
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
