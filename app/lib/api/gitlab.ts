import { isAllowedUrl } from '~/utils/url';

const DEFAULT_GITLAB_URL = 'https://gitlab.com';

/**
 * The GitLab instance base URL from a request body, or `null` when it is not a public
 * http(s) address.
 *
 * `gitlabUrl` is user-supplied (self-hosted GitLab), and the server fetches
 * `${gitlabUrl}/api/v4/...`. Unchecked, that reached the Docker network or cloud
 * metadata, and a `?` or `#` in the value took over the rest of the path. The query,
 * fragment and credentials are dropped, so only scheme, host, port and path remain.
 */
export function gitlabApiBase(input: unknown): string | null {
  const raw = typeof input === 'string' && input.trim() ? input.trim() : DEFAULT_GITLAB_URL;

  if (!isAllowedUrl(raw)) {
    return null;
  }

  const url = new URL(raw);
  url.search = '';
  url.hash = '';
  url.username = '';
  url.password = '';

  return url.toString().replace(/\/+$/, '');
}

/** A GitLab project id for a URL path: numeric, or a namespace path encoded as one segment. */
export function gitlabProjectPathSegment(projectId: unknown): string | null {
  const value = String(projectId ?? '').trim();

  if (!value) {
    return null;
  }

  if (/^\d+$/.test(value)) {
    return value;
  }

  try {
    // Accept both "group/project" and an already-encoded "group%2Fproject".
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return null;
  }
}
