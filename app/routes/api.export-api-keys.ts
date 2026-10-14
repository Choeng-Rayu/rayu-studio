import type { LoaderFunction } from '@remix-run/cloudflare';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { isStudioDesktop } from '~/lib/studio-connections';

/**
 * Export the API keys THIS browser saved (Settings → Data → Export API keys).
 *
 * Hosted account credentials are write-only and cannot be exported. Only the
 * desktop compatibility branch returns the caller's own saved cookie keys;
 * neither branch exports operator/server environment credentials.
 */
export const loader: LoaderFunction = async ({ request }) => {
  if (!isStudioDesktop()) {
    return Response.json(
      { error: 'Account credentials are write-only and cannot be exported.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const apiKeys = getApiKeysFromCookie(request.headers.get('Cookie'));

  return Response.json(apiKeys, { headers: { 'Cache-Control': 'no-store' } });
};
