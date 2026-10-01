import type { LoaderFunction } from '@remix-run/cloudflare';
import { getApiKeysFromCookie } from '~/lib/api/cookies';

/**
 * Export the API keys THIS browser saved (Settings → Data → Export API keys).
 *
 * Only the caller's own cookie keys are returned. This route used to merge in the
 * server's provider keys from its environment (OPENAI_API_KEY, ANTHROPIC_API_KEY, …)
 * with no authentication, so on a shared deployment any visitor could download the
 * operator's keys. Server-side keys stay usable for chat; they just never leave the
 * server. `/api/check-env-key` still reports whether one is configured.
 */
export const loader: LoaderFunction = async ({ request }) => {
  const apiKeys = getApiKeysFromCookie(request.headers.get('Cookie'));

  return Response.json(apiKeys, { headers: { 'Cache-Control': 'no-store' } });
};
