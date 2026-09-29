import { backendApiBase as configuredBackendApiBase } from '~/lib/rayu/backend-url';

type RuntimeEnv = Record<string, unknown>;

const DEFAULT_GATEWAY_URL = 'https://gateway.rayucode.com';

export interface RayuUser {
  id: number;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface RayuAuthResult {
  accessToken: string;
  user: RayuUser;
  setCookies: string[];
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get('Cookie') ?? '';

  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');

    if (separator < 0) {
      continue;
    }

    const key = item.slice(0, separator).trim();

    if (key !== name) {
      continue;
    }

    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function backendApiBase(env?: RuntimeEnv): string | null {
  return configuredBackendApiBase(env);
}

export function gatewayBase(env?: RuntimeEnv): string | null {
  const configured = getEnv(env, 'RAYU_GATEWAY_URL') || DEFAULT_GATEWAY_URL;
  return configured.replace(/\/+$/, '');
}

export function authBridgeUrl(env?: RuntimeEnv): string {
  return getEnv(env, 'RAYU_STUDIO_AUTH_BRIDGE_URL') || 'https://rayucode.com/studio-login';
}

function getEnv(env: RuntimeEnv | undefined, key: string): string | undefined {
  const value = env?.[key];

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof process !== 'undefined') {
    const processValue = process.env?.[key];

    if (processValue?.trim()) {
      return processValue.trim();
    }
  }

  return undefined;
}

function cookieAttributes(request: Request, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function tokenMaxAge(token: string, fallbackSeconds: number): number {
  try {
    const payload = token.split('.')[1];

    if (!payload) {
      return fallbackSeconds;
    }

    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };

    if (typeof decoded.exp !== 'number') {
      return fallbackSeconds;
    }

    return Math.max(1, Math.floor(decoded.exp - Date.now() / 1000));
  } catch {
    return fallbackSeconds;
  }
}

export function sessionCookies(
  request: Request,
  tokens: { accessToken: string; refreshToken: string; expiresAt: number },
): string[] {
  const accessMaxAge = Math.max(1, Math.floor((tokens.expiresAt - Date.now()) / 1000));
  return [
    `rayu_access=${encodeURIComponent(tokens.accessToken)}; ${cookieAttributes(request, accessMaxAge)}`,
    `rayu_refresh=${encodeURIComponent(tokens.refreshToken)}; ${cookieAttributes(request, tokenMaxAge(tokens.refreshToken, 30 * 24 * 60 * 60))}`,
  ];
}

export function clearAuthCookies(request: Request): string[] {
  return [
    `rayu_access=; ${cookieAttributes(request, 0)}`,
    `rayu_refresh=; ${cookieAttributes(request, 0)}`,
    `rayu_login_state=; ${cookieAttributes(request, 0)}`,
    `rayu_login_pair=; ${cookieAttributes(request, 0)}`,
  ];
}

export function clearLoginStateCookie(request: Request): string {
  return `rayu_login_state=; ${cookieAttributes(request, 0)}`;
}

export function loginPairCookie(request: Request, pair: string): string {
  return `rayu_login_pair=${encodeURIComponent(pair)}; ${cookieAttributes(request, 10 * 60)}`;
}

export function clearLoginPairCookie(request: Request): string {
  return `rayu_login_pair=; ${cookieAttributes(request, 0)}`;
}

export function loginStateCookie(request: Request, state: string): string {
  return `rayu_login_state=${encodeURIComponent(state)}; ${cookieAttributes(request, 10 * 60)}`;
}

function tokenNearExpiry(token: string): boolean {
  try {
    const payload = token.split('.')[1];

    if (!payload) {
      return true;
    }

    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };

    return typeof decoded.exp !== 'number' || decoded.exp * 1000 <= Date.now() + 60_000;
  } catch {
    return true;
  }
}

async function refreshTokens(
  base: string,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null> {
  const response = await fetch(`${base}/cli/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const result = (await response.json()) as { accessToken?: string; refreshToken?: string; expiresAt?: number };

  if (!result.accessToken || !result.refreshToken || !result.expiresAt) {
    return null;
  }

  return result as { accessToken: string; refreshToken: string; expiresAt: number };
}

/** Validate a signed-in session with Rayu backend; renew before it expires. */
export async function getRayuAuth(request: Request, env?: RuntimeEnv): Promise<RayuAuthResult | null> {
  const base = backendApiBase(env);
  let accessToken = readCookie(request, 'rayu_access');
  const refreshToken = readCookie(request, 'rayu_refresh');

  if (!base || !refreshToken) {
    return null;
  }

  const setCookies: string[] = [];

  try {
    /*
     * The short-lived access cookie may already have expired in the browser.
     * The longer-lived refresh cookie is sufficient to restore the session.
     */
    if (!accessToken || tokenNearExpiry(accessToken)) {
      const tokens = await refreshTokens(base, refreshToken);

      if (!tokens) {
        return null;
      }

      accessToken = tokens.accessToken;
      setCookies.push(...sessionCookies(request, tokens));
    }

    let profile = await fetch(`${base}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    if (profile.status === 401 && setCookies.length === 0) {
      const tokens = await refreshTokens(base, refreshToken);

      if (!tokens) {
        return null;
      }

      accessToken = tokens.accessToken;
      setCookies.push(...sessionCookies(request, tokens));
      profile = await fetch(`${base}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
    }

    if (profile.status === 401) {
      return null;
    }

    if (!profile.ok) {
      throw new Error(`Rayu account check failed (${profile.status})`);
    }

    const payload = (await profile.json()) as { user?: RayuUser };

    if (!payload.user?.id) {
      return null;
    }

    return { accessToken, user: payload.user, setCookies };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Rayu account check failed')) {
      throw error;
    }

    throw new Error('Rayu authentication service is unavailable');
  }
}

export function appendAuthCookies(headers: Headers, cookies: string[]): Headers {
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie);
  }
  return headers;
}
