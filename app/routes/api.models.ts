import { json } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { appendAuthCookies, backendApiBase, getRayuAuth } from '~/lib/.server/rayu-auth';
import {
  classifyRayuProvider,
  type RayuEntitlementsSummary,
  type RayuProviderStatus,
} from '~/lib/rayu/provider-status';

interface ModelsResponse {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
  rayuStatus: RayuProviderStatus;
  providerError?: string;
}

let cachedProviders: ProviderInfo[] | null = null;
let cachedDefaultProvider: ProviderInfo | null = null;

function getProviderInfo(llmManager: LLMManager) {
  if (!cachedProviders) {
    cachedProviders = llmManager.getAllProviders().map((provider) => ({
      name: provider.name,
      staticModels: provider.staticModels,
      getApiKeyLink: provider.getApiKeyLink,
      labelForGetApiKey: provider.labelForGetApiKey,
      icon: provider.icon,
    }));
  }

  if (!cachedDefaultProvider) {
    const defaultProvider = llmManager.getDefaultProvider();
    cachedDefaultProvider = {
      name: defaultProvider.name,
      staticModels: defaultProvider.staticModels,
      getApiKeyLink: defaultProvider.getApiKeyLink,
      labelForGetApiKey: defaultProvider.labelForGetApiKey,
      icon: defaultProvider.icon,
    };
  }

  return { providers: cachedProviders, defaultProvider: cachedDefaultProvider };
}

export async function loader({
  request,
  params,
  context,
}: {
  request: Request;
  params: { provider?: string };
  context: {
    cloudflare?: {
      env: Record<string, string>;
    };
  };
}): Promise<Response> {
  const llmManager = LLMManager.getInstance(context.cloudflare?.env);

  // Get client side maintained API keys and provider settings from cookies
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  let auth: Awaited<ReturnType<typeof getRayuAuth>> = null;
  let authFailed = false;

  try {
    auth = await getRayuAuth(request, context.cloudflare?.env as Record<string, unknown>);

    if (auth) {
      apiKeys.Rayu = auth.accessToken;
    }
  } catch {
    authFailed = true;
  }

  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  const { providers, defaultProvider } = getProviderInfo(llmManager);

  let modelList: ModelInfo[] = [];
  let rayuCatalogFailed = false;
  let providerError: string | undefined;
  const onProviderError = (provider: string, error: unknown) => {
    if (provider === 'Rayu') {
      rayuCatalogFailed = true;
    }

    if (provider !== params.provider) {
      return;
    }

    const message = error instanceof Error ? error.message : '';

    if (provider === 'Rayu API Key') {
      providerError = message.includes('No Rayu API key')
        ? 'Add a Rayu API key to use this provider, or select Rayu for account auth.'
        : message.includes('(401)') || message.includes('(403)')
          ? 'The Rayu API key was rejected. Check or replace the key.'
          : 'Could not reach the Rayu gateway. Check its URL and connection, then retry.';
    } else {
      providerError = `Could not load ${provider} models. Check its configuration and retry.`;
    }
  };

  if (params.provider) {
    // Only update models for the specific provider
    const provider = llmManager.getProvider(params.provider);

    if (provider) {
      modelList = await llmManager.getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: context.cloudflare?.env,
        onProviderError,
      });
    }
  } else {
    // Update all models
    modelList = await llmManager.updateModelList({
      apiKeys,
      providerSettings,
      serverEnv: context.cloudflare?.env,
      onProviderError,
    });
  }

  let entitlements: RayuEntitlementsSummary | undefined;
  const hasRayuModels = modelList.some((model) => model.provider === 'Rayu');

  if (auth && !rayuCatalogFailed && (!params.provider || params.provider === 'Rayu')) {
    try {
      const base = backendApiBase(context.cloudflare?.env as Record<string, unknown>);

      if (!base) {
        throw new Error('Rayu backend URL is unavailable');
      }

      const response = await fetch(`${base}/me/entitlements`, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        throw new Error(`Rayu entitlements request failed (${response.status})`);
      }

      entitlements = (await response.json()) as RayuEntitlementsSummary;
    } catch {
      rayuCatalogFailed = true;
    }
  }

  const rayuStatus = authFailed
    ? 'unavailable'
    : classifyRayuProvider({
        signedIn: !!auth,
        hasModels: hasRayuModels,
        catalogFailed: rayuCatalogFailed,
        entitlements,
      });
  const headers = appendAuthCookies(new Headers({ 'Cache-Control': 'no-store' }), auth?.setCookies ?? []);

  return json<ModelsResponse>(
    {
      modelList,
      providers,
      defaultProvider,
      rayuStatus,
      providerError,
    },
    { headers },
  );
}
