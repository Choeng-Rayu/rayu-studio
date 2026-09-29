import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRayuAuth } from './rayu-auth';

afterEach(() => vi.unstubAllGlobals());

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
