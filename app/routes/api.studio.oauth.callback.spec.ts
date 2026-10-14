import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loader, vercelCompletionUrl } from './api.studio.oauth.$kind.callback';
import { SERVICE_CONNECTIONS } from '~/lib/studio-connections';

const { session, complete } = vi.hoisted(() => ({ session: vi.fn(), complete: vi.fn() }));
vi.mock('~/lib/.server/studio-backend', () => ({ studioBackendSession: session, callStudioBackend: complete }));

function callback(kind: string, account = 42, extra = '') {
  const binding = encodeURIComponent(
    JSON.stringify({ userId: account, state: 'state-123', browserBinding: 'browser-123' }),
  );
  return loader({
    request: new Request(
      `https://studio.rayucode.com/api/studio/oauth/${kind}/callback?state=state-123&code=private-code${extra}`,
      { headers: { Cookie: `studio_oauth_${kind}=${binding}` } },
    ),
    context: {},
    params: { kind },
  } as never);
}
beforeEach(() => {
  session.mockReset().mockImplementation(async () => ({
    auth: { user: { id: 42 }, accessToken: 'session' },
    headers: new Headers({ 'Cache-Control': 'no-store' }),
  }));
  complete.mockReset().mockResolvedValue(Response.json({ kind: 'connected' }));
});

describe('Studio OAuth callback', () => {
  it.each(SERVICE_CONNECTIONS)('completes %s only with the matching account and browser binding', async (kind) => {
    const response = await callback(kind);
    expect(response.status).toBe(200);
    expect(complete).toHaveBeenCalledWith(expect.anything(), `connections/${kind}/oauth/complete`, {
      method: 'POST',
      body: { state: 'state-123', browserBinding: 'browser-123', code: 'private-code' },
    });

    const html = await response.text();
    expect(html).toContain('Connected to Studio');
    expect(html).not.toContain('private-code');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
  it.each(SERVICE_CONNECTIONS)('does not assign %s to an account that changed during authorization', async (kind) => {
    const response = await callback(kind, 99);
    expect(response.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
    expect(response.headers.get('Set-Cookie')).toContain('studio_oauth_error=');
  });
  it('does not display provider failure bodies or redirect a rejected callback', async () => {
    complete.mockResolvedValue(Response.json({ error: 'private-provider-response' }, { status: 400 }));

    const response = await callback('vercel', 42, '&next=https%3A%2F%2Fvercel.com%2Fdashboard');
    expect(response.status).toBe(400);
    expect(response.headers.get('Location')).toBeNull();
    expect(await response.text()).not.toContain('private-provider-response');
  });
  it('finishes the official Vercel flow with a no-referrer redirect only to Vercel', async () => {
    const response = await callback('vercel', 42, '&next=https%3A%2F%2Fvercel.com%2Fdashboard');
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://vercel.com/dashboard');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');

    for (const value of [
      'https://vercel.com.evil.test',
      'https://user:pass@vercel.com',
      'http://vercel.com',
      '//vercel.com',
      'https://vercel.com:8443',
    ]) {
      expect(vercelCompletionUrl(value)).toBeNull();
    }
  });
});
