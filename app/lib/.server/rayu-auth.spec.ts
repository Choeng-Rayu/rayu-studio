import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRayuAuth, publicOrigin, sessionCookies } from './rayu-auth';

afterEach(() => vi.unstubAllGlobals());

describe('publicOrigin behind a TLS-terminating proxy', () => {
  const proxied = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  it('upgrades to https when the proxy reports the browser used https', () => {
    expect(publicOrigin(proxied('http://studio.example.com/api/auth/start', { 'X-Forwarded-Proto': 'https' }))).toBe(
      'https://studio.example.com',
    );
  });

  it('uses the first hop when the proxy chain lists several protocols', () => {
    expect(publicOrigin(proxied('http://studio.example.com/', { 'X-Forwarded-Proto': 'https, http' }))).toBe(
      'https://studio.example.com',
    );
  });

  it('keeps plain http for direct local access', () => {
    expect(publicOrigin(proxied('http://127.0.0.1:5173/api/auth/start'))).toBe('http://127.0.0.1:5173');
  });

  it('never downgrades an https request', () => {
    expect(publicOrigin(proxied('https://studio.example.com/', { 'X-Forwarded-Proto': 'http' }))).toBe(
      'https://studio.example.com',
    );
  });

  it('takes only the scheme from headers, never the host', () => {
    const request = proxied('http://studio.example.com/', {
      'X-Forwarded-Proto': 'https',
      'X-Forwarded-Host': 'attacker.example',
    });

    expect(publicOrigin(request)).toBe('https://studio.example.com');
  });

  it('marks session cookies Secure when the browser connection was https', () => {
    const request = proxied('http://studio.example.com/auth/callback', { 'X-Forwarded-Proto': 'https' });
    const cookies = sessionCookies(request, {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000,
    });

    expect(cookies).toHaveLength(2);
    cookies.forEach((cookie) => expect(cookie).toContain('; Secure'));
  });
});

describe('Rayu Studio session refresh', () => {
  it('renews when the access cookie has expired but the refresh cookie remains', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresAt: Date.now() + 60 * 60_000,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          user: { id: 42, email: 'rayu@example.com', displayName: 'Rayu', avatarUrl: null },
        }),
      );
    vi.stubGlobal('fetch', fetchSpy);

    const request = new Request('https://studio.rayucode.com/api/auth/session', {
      headers: { Cookie: 'rayu_refresh=old-refresh-token' },
    });
    const auth = await getRayuAuth(request, { RAYU_BACKEND_URL: 'https://api.rayucode.com/api' });

    expect(auth?.accessToken).toBe('new-access-token');
    expect(auth?.user.id).toBe(42);
    expect(auth?.setCookies).toHaveLength(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(1, 'https://api.rayucode.com/api/cli/refresh', expect.any(Object));
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://api.rayucode.com/api/me',
      expect.objectContaining({
        headers: { Authorization: 'Bearer new-access-token' },
      }),
    );
  });

  it('rejects an invalid refresh token without using the old access token', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchSpy);

    const request = new Request('https://studio.rayucode.com/api/auth/session', {
      headers: { Cookie: 'rayu_refresh=invalid' },
    });

    expect(await getRayuAuth(request)).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
