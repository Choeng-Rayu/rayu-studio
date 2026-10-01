/**
 * URL validation utilities with SSRF protection.
 *
 * Server routes that fetch a user-supplied URL (`/api/web-search`, `/api/git-proxy`)
 * run inside the Studio container, which can reach the Docker network, the Coolify
 * services next to it and the host. Only public HTTP(S) destinations are allowed.
 */

const PRIVATE_IPV4_PATTERNS = [
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // "This network", including 0.0.0.0
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Class A private
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/, // Carrier-grade NAT 100.64/10
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Loopback
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // Link-local (cloud metadata lives here)
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // Class B private (Docker bridges)
  /^192\.0\.0\.\d{1,3}$/, // IETF protocol assignments
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // Class C private
  /^198\.1[89]\.\d{1,3}\.\d{1,3}$/, // Benchmarking 198.18/15
  /^(22[4-9]|2[3-5]\d)\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Multicast and reserved
];

// Names that only resolve inside a private network.
const BLOCKED_HOSTNAMES = new Set(['localhost', 'host.docker.internal', 'gateway.docker.internal', 'metadata']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

export function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPrivateIpv4(address: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(address));
}

/** `address` is a bracket-free IPv6 literal as normalized by the URL parser. */
function isPrivateIpv6(address: string): boolean {
  if (address === '::' || address === '::1') {
    return true;
  }

  // IPv4-mapped (::ffff:7f00:1) and IPv4-compatible (::7f00:1) forms: check the IPv4.
  const embedded = address.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);

  if (embedded) {
    const high = parseInt(embedded[1], 16);
    const low = parseInt(embedded[2], 16);

    return isPrivateIpv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
  }

  // Unique-local fc00::/7 and link-local fe80::/10 (hextets are serialized without leading zeros).
  return /^f[cd][0-9a-f]{2}:/.test(address) || /^fe[89ab][0-9a-f]:/.test(address);
}

export function isAllowedUrl(input: string): boolean {
  if (!isValidUrl(input)) {
    return false;
  }

  /*
   * The WHATWG parser has already normalized the host: decimal/hex IPv4 forms such as
   * 2130706433 or 0x7f.1 become 127.0.0.1, and IPv6 literals are compressed.
   */
  const hostname = new URL(input).hostname.toLowerCase().replace(/\.$/, '');

  if (hostname.startsWith('[')) {
    return !isPrivateIpv6(hostname.slice(1, -1));
  }

  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return false;
  }

  // A single-label name ("redis", "coolify-db") is a container or LAN hostname.
  if (!hostname.includes('.')) {
    return false;
  }

  return !isPrivateIpv4(hostname);
}

export class BlockedUrlError extends Error {
  constructor(readonly url: string) {
    super('URL is not allowed. Only public HTTP/HTTPS URLs are accepted.');
    this.name = 'BlockedUrlError';
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * `fetch` for user-supplied URLs: every redirect hop is re-checked with
 * `isAllowedUrl`, so a public URL cannot bounce the server to an internal address.
 * Redirects are only followed for GET/HEAD (a streamed request body cannot be
 * replayed); other methods get the redirect response back unchanged.
 */
export async function fetchAllowedUrl(
  input: string,
  init: RequestInit = {},
  maxRedirects = 5,
): Promise<{ response: Response; url: string; redirected: boolean }> {
  const method = (init.method || 'GET').toUpperCase();
  const followRedirects = method === 'GET' || method === 'HEAD';
  let url = input;

  for (let hop = 0; ; hop++) {
    if (!isAllowedUrl(url)) {
      throw new BlockedUrlError(url);
    }

    const response = await fetch(url, { ...init, redirect: 'manual' });
    const location = response.headers.get('location');

    if (!followRedirects || !REDIRECT_STATUSES.has(response.status) || !location) {
      return { response, url, redirected: hop > 0 };
    }

    if (hop >= maxRedirects) {
      throw new Error(`Too many redirects (more than ${maxRedirects}).`);
    }

    // Release the redirect body before following it.
    await response.body?.cancel();
    url = new URL(location, url).toString();
  }
}
