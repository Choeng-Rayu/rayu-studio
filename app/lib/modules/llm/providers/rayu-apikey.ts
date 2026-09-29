import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { rayuModelInstance, rayuModels } from './rayu-provider-utils';

export default class RayuApiKeyProvider extends BaseProvider {
  name = 'Rayu API Key';

  /*
   * Rendered as a CSS class (e.g. APIKeyManager's `${provider.icon} w-4 h-4`),
   * so this must be an i-rayu: icon, not an image path.
   */
  icon = 'i-rayu:rayucode';
  getApiKeyLink = 'https://rayucode.com/dashboard/api-keys';
  labelForGetApiKey = 'Create a Rayu API key';
  config = { apiTokenKey: 'RAYU_API_KEY', baseUrlKey: 'RAYU_GATEWAY_URL' };
  staticModels: ModelInfo[] = [];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ) {
    const { apiKey, baseUrl } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'RAYU_API_KEY',
    });

    if (!apiKey) {
      throw new Error('No Rayu API key is configured. Add one in Studio settings or select Rayu account auth.');
    }

    return rayuModels(this.name, apiKey, serverEnv, baseUrl);
  }

  getModelInstance(options: {
    model: string;
    serverEnv?: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const env = this.convertEnvToRecord(options.serverEnv);
    const { apiKey, baseUrl } = this.getProviderBaseUrlAndKey({
      apiKeys: options.apiKeys,
      providerSettings: options.providerSettings?.[this.name],
      serverEnv: env,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'RAYU_API_KEY',
    });

    return rayuModelInstance(options.model, apiKey, env, baseUrl);
  }
}
