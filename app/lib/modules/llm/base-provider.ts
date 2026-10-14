import type { LanguageModelV1 } from 'ai';
import type { ProviderInfo, ProviderConfig, ModelInfo } from './types';
import type { IProviderSetting } from '~/types/model';
import { createOpenAI } from '@ai-sdk/openai';
import { LLMManager } from './manager';
import { isStudioDesktop } from '~/lib/studio-connections';

/** Default timeout for model listing API calls (5 seconds) */
const MODEL_FETCH_TIMEOUT = 5_000;

export abstract class BaseProvider implements ProviderInfo {
  abstract name: string;
  abstract staticModels: ModelInfo[];
  abstract config: ProviderConfig;
  cachedDynamicModels?: {
    cacheId: string;
    models: ModelInfo[];
    cachedAt: number;
  };

  getApiKeyLink?: string;
  labelForGetApiKey?: string;
  icon?: string;

  /**
   * Convert Cloudflare Env bindings to a plain Record<string, string>.
   * Useful because provider methods expect Record<string, string> but
   * Cloudflare Workers pass an Env interface.
   */
  protected convertEnvToRecord(env?: Env): Record<string, string> {
    if (!env) {
      return {};
    }

    return Object.entries(env).reduce(
      (acc, [key, value]) => {
        acc[key] = String(value);

        return acc;
      },
      {} as Record<string, string>,
    );
  }

  /**
   * Rewrite localhost / 127.0.0.1 URLs to host.docker.internal when
   * running inside Docker. Only applies on the server side.
   */
  protected resolveDockerUrl(baseUrl: string, serverEnv?: Record<string, string>): string {
    const isDocker = process?.env?.RUNNING_IN_DOCKER === 'true' || serverEnv?.RUNNING_IN_DOCKER === 'true';

    if (!isDocker) {
      return baseUrl;
    }

    return baseUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
  }

  /**
   * Create an AbortSignal that times out after the given milliseconds.
   * Used to prevent model-listing fetches from hanging indefinitely.
   */
  protected createTimeoutSignal(ms: number = MODEL_FETCH_TIMEOUT): AbortSignal {
    return AbortSignal.timeout(ms);
  }

  getProviderBaseUrlAndKey(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: IProviderSetting;
    serverEnv?: Record<string, string>;
    defaultBaseUrlKey: string;
    defaultApiTokenKey: string;
  }) {
    const { apiKeys, providerSettings, serverEnv, defaultBaseUrlKey, defaultApiTokenKey } = options;

    if (!isStudioDesktop() && providerSettings?.enabled === false) {
      throw new Error('This provider is disabled by your administrator.');
    }

    let settingsBaseUrl = providerSettings?.baseUrl;
    const manager = LLMManager.getInstance();

    if (settingsBaseUrl && settingsBaseUrl.length == 0) {
      settingsBaseUrl = undefined;
    }

    const baseUrlKey = this.config.baseUrlKey || defaultBaseUrlKey;
    const useEnvironment =
      isStudioDesktop() || this.name.startsWith('Rayu') || ['Ollama', 'LMStudio'].includes(this.name);
    let baseUrl =
      settingsBaseUrl ||
      (useEnvironment
        ? serverEnv?.[baseUrlKey] || process?.env?.[baseUrlKey] || manager.env?.[baseUrlKey]
        : undefined) ||
      this.config.baseUrl;

    if (baseUrl && baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }

    const apiTokenKey = this.config.apiTokenKey || defaultApiTokenKey;
    const apiKey =
      apiKeys?.[this.name] ||
      (isStudioDesktop()
        ? serverEnv?.[apiTokenKey] || process?.env?.[apiTokenKey] || manager.env?.[apiTokenKey]
        : undefined);

    if (!isStudioDesktop() && !apiKey && !['Ollama', 'LMStudio'].includes(this.name)) {
      if (this.name === 'Rayu API Key') {
        throw new Error('No Rayu API key is configured. Add one in Studio settings or select Rayu account auth.');
      }

      throw new Error(`Connect ${this.name} to your Rayu account in Studio settings first.`);
    }

    return {
      baseUrl,
      apiKey,
    };
  }
  getModelsFromCache(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }): ModelInfo[] | null {
    if (!isStudioDesktop() && !options.providerSettings?.[this.name]?.cacheScope) {
      return null;
    }

    if (!this.cachedDynamicModels) {
      return null;
    }

    /*
     * Rayu entitlements can change while the access token stays the same.
     * A cached empty result must never survive an upgrade or wallet top-up.
     */
    if (Date.now() - this.cachedDynamicModels.cachedAt > (this.name.startsWith('Rayu') ? 60_000 : 300_000)) {
      this.cachedDynamicModels = undefined;
      return null;
    }

    const cacheKey = this.cachedDynamicModels.cacheId;
    const generatedCacheKey = this.getDynamicModelsCacheKey(options);

    if (cacheKey !== generatedCacheKey) {
      this.cachedDynamicModels = undefined;

      return null;
    }

    return this.cachedDynamicModels.models;
  }
  getDynamicModelsCacheKey(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }) {
    const scope = options.providerSettings?.[this.name]?.cacheScope;

    if (!isStudioDesktop()) {
      return JSON.stringify({
        provider: this.name,
        scope: scope ?? 'anonymous',
        baseUrl: options.providerSettings?.[this.name]?.baseUrl,
      });
    }

    // Only include provider-relevant env keys, not the entire server environment
    const relevantEnvKeys = [this.config.baseUrlKey, this.config.apiTokenKey].filter(Boolean) as string[];
    const relevantEnv: Record<string, string> = {};

    for (const key of relevantEnvKeys) {
      if (options.serverEnv?.[key]) {
        relevantEnv[key] = options.serverEnv[key];
      }
    }

    return JSON.stringify({
      apiKeys: options.apiKeys?.[this.name],
      providerSettings: options.providerSettings?.[this.name],
      serverEnv: relevantEnv,
    });
  }
  storeDynamicModels(
    options: {
      apiKeys?: Record<string, string>;
      providerSettings?: Record<string, IProviderSetting>;
      serverEnv?: Record<string, string>;
    },
    models: ModelInfo[],
  ) {
    if (!isStudioDesktop() && !options.providerSettings?.[this.name]?.cacheScope) {
      return;
    }

    if (this.name.startsWith('Rayu') && models.length === 0) {
      this.cachedDynamicModels = undefined;
      return;
    }

    const cacheId = this.getDynamicModelsCacheKey(options);

    this.cachedDynamicModels = {
      cacheId,
      models,
      cachedAt: Date.now(),
    };
  }

  // Declare the optional getDynamicModels method
  getDynamicModels?(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]>;

  abstract getModelInstance(options: {
    model: string;
    serverEnv?: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1;
}

type OptionalApiKey = string | undefined;

export function getOpenAILikeModel(baseURL: string, apiKey: OptionalApiKey, model: string) {
  const openai = createOpenAI({
    baseURL,
    apiKey,
  });

  return openai(model);
}
