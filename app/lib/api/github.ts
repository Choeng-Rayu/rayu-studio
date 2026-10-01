import { getApiKeysFromCookie } from './cookies';

type RouteContext = { cloudflare?: { env?: Record<string, unknown> } } | undefined;

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * The GitHub token to act with for this request: the caller's own saved token, or a
 * single-user VITE_GITHUB_ACCESS_TOKEN.
 *
 * Never the server's GITHUB_TOKEN. That one exists only so starter-template downloads
 * do not share GitHub's anonymous rate limit; using it here showed every visitor the
 * operator's GitHub account, repositories and branches, private ones included.
 */
export function githubTokenForRequest(request: Request, context?: RouteContext): string {
  const apiKeys = getApiKeysFromCookie(request.headers.get('Cookie'));
  const env = context?.cloudflare?.env;
  const fromProcess = typeof process === 'undefined' ? undefined : process.env?.VITE_GITHUB_ACCESS_TOKEN;

  return (
    nonEmpty(apiKeys.GITHUB_API_KEY) ||
    nonEmpty(apiKeys.VITE_GITHUB_ACCESS_TOKEN) ||
    nonEmpty(env?.VITE_GITHUB_ACCESS_TOKEN) ||
    nonEmpty(fromProcess) ||
    ''
  );
}
