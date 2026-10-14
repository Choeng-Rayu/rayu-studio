import { AI_CONNECTIONS, isStudioDesktop } from '~/lib/studio-connections';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { backendApiBase, type RayuAuthResult } from './rayu-auth';
import type { IProviderSetting } from '~/types/model';

/** Trusted server-to-server only. Never re-export this helper from a browser route. */
export async function studioCredentials(
  request: Request,
  env: Record<string, unknown> | undefined,
  auth: RayuAuthResult | null,
) {
  if (isStudioDesktop()) {
    const apiKeys = getApiKeysFromCookie(request.headers.get('Cookie'));

    if (auth) {
      apiKeys.Rayu = auth.accessToken;
    }

    return { apiKeys, providerSettings: getProviderSettingsFromCookie(request.headers.get('Cookie')) };
  }

  const apiKeys: Record<string, string> = auth ? { Rayu: auth.accessToken } : {};
  const providerSettings: Record<string, IProviderSetting> = {};

  if (!auth) {
    return { apiKeys, providerSettings };
  }

  const secret =
    typeof env?.RAYU_STUDIO_SERVER_SECRET === 'string'
      ? env.RAYU_STUDIO_SERVER_SECRET
      : process.env.RAYU_STUDIO_SERVER_SECRET;

  if (!secret || secret.length < 32) {
    throw new Response('Studio account connections are not configured on this server.', { status: 503 });
  }

  const response = await fetch(`${backendApiBase(env)}/studio/internal/credentials/resolve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'x-rayu-studio-secret': secret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ kinds: Object.values(AI_CONNECTIONS) }),
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Response(
      'Account provider credentials are unavailable. Please reconnect or contact your administrator.',
      { status: response.status >= 500 ? 503 : 403 },
    );
  }

  const result = (await response.json()) as {
    userId: number;
    credentials: Record<
      string,
      {
        token: string;
        connectionId?: number;
        revision: number;
        configurationRevision?: string;
        meta: Record<string, string>;
      }
    >;
    disabledProviders?: string[];
  };

  if (result.userId !== auth.user.id) {
    throw new Response('Account changed. Retry your request.', { status: 409 });
  }

  for (const [provider, credential] of Object.entries(result.credentials)) {
    apiKeys[provider] = credential.token;
    providerSettings[provider] = {
      enabled: true,
      baseUrl: credential.meta?.baseUrl,
      cacheScope: `${auth.user.id}:${credential.revision}${credential.connectionId !== undefined ? `:connection-${credential.connectionId}` : ''}${credential.configurationRevision ? `:${credential.configurationRevision}` : ''}`,
    };
  }
  providerSettings.Rayu = { enabled: true, cacheScope: String(auth.user.id) };

  for (const provider of result.disabledProviders ?? []) {
    providerSettings[provider] = { enabled: false, cacheScope: `${auth.user.id}:disabled` };
  }

  return { apiKeys, providerSettings };
}
