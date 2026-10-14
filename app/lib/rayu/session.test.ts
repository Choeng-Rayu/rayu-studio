import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken, StudioRequestError } from './session';

afterEach(() => vi.unstubAllGlobals());

describe('Remote access token lookup', () => {
  it.each([401, 403])('requires sign-in for an authentication refusal (%s)', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status })),
    );
    expect(await getAccessToken()).toBeNull();
  });

  it('distinguishes a temporary service outage from being signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await expect(getAccessToken()).rejects.toBeInstanceOf(StudioRequestError);
  });
});
