import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { rayuHostedModels, rayuModelInstance } from './rayu-provider-utils';

export default class RayuHostedProvider extends BaseProvider {
  name = 'Rayu';

  /*
   * Rendered as a CSS class (e.g. APIKeyManager's `${provider.icon} w-4 h-4`),
   * so this must be an i-rayu: icon, not an image path.
   */
  icon = 'i-rayu:rayucode';
  getApiKeyLink = 'https://rayucode.com/pricing';
  labelForGetApiKey = 'Manage your Rayu plan';
  config = { apiTokenKey: 'RAYU_AUTH_TOKEN', baseUrlKey: 'RAYU_GATEWAY_URL' };
  staticModels: ModelInfo[] = [];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    _settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ) {
    return rayuHostedModels(apiKeys?.Rayu, serverEnv);
  }

  getModelInstance(options: {
    model: string;
    serverEnv?: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const env = this.convertEnvToRecord(options.serverEnv);
    return rayuModelInstance(options.model, options.apiKeys?.Rayu, env);
  }
}
