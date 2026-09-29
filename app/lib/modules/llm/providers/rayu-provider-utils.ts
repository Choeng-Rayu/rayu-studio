import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV1 } from 'ai';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { backendApiBase } from '~/lib/rayu/backend-url';
import { compatibleRayuAnthropicResponse } from './rayu-anthropic-compat';

type ServerEnv = Record<string, string | undefined>;

function isLoopbackUrl(value?: string): boolean {
  if (!value) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}

function gatewayUrl(serverEnv?: ServerEnv, baseUrlOverride?: string): string {
  const configuredGateway =
    baseUrlOverride ||
    serverEnv?.RAYU_GATEWAY_URL ||
    (typeof process !== 'undefined' ? process.env?.RAYU_GATEWAY_URL : '');
  const backendUrl =
    serverEnv?.RAYU_BACKEND_URL ||
    serverEnv?.RAYU_API_URL ||
    (typeof process !== 'undefined' ? process.env?.RAYU_BACKEND_URL || process.env?.RAYU_API_URL : '');

  /*
   * Local backend tokens are signed with a local secret and cannot be verified by
   * the production gateway. Follow the local backend unless a gateway was explicit.
   */
  const base =
    configuredGateway || (isLoopbackUrl(backendUrl) ? 'http://localhost:8080' : 'https://gateway.rayucode.com');
  const parsed = new URL(base);

  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('Rayu gateway URL must use HTTPS.');
  }

  return parsed.toString().replace(/\/+$/, '');
}

export async function rayuModels(
  providerName: string,
  token: string | undefined,
  serverEnv?: ServerEnv,
  baseUrlOverride?: string,
): Promise<ModelInfo[]> {
  if (!token) {
    return [];
  }

  const response = await fetch(`${gatewayUrl(serverEnv, baseUrlOverride)}/v1/models`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Rayu-Client': 'studio',
      'X-Rayu-Query-Source': 'studio',
    },
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Rayu model catalog request failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ id: string; label?: string; contextWindow?: number | null }>;
  };

  return (payload.data ?? []).map((model) => ({
    name: model.id,
    label: model.label || model.id,
    provider: providerName,
    maxTokenAllowed: model.contextWindow ?? 128_000,
    maxCompletionTokens: 16_384,
  }));
}

/**
 * OAuth users see the backend's complete hosted catalog, as in the CLI.
 * The gateway's /v1/models only lists the plan-allowed subset and is kept for
 * the separate Rayu API Key provider.
 */
export async function rayuHostedModels(token: string | undefined, serverEnv?: ServerEnv): Promise<ModelInfo[]> {
  if (!token) {
    return [];
  }

  const response = await fetch(`${backendApiBase(serverEnv)}/me/entitlements`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Rayu entitlements request failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    hostedModels?: Array<{ code: string; label?: string | null; contextWindow?: number | null }>;
    allowedModels?: Array<{ code: string; label?: string | null; contextWindow?: number | null }>;
  };
  const catalog = payload.hostedModels ?? payload.allowedModels;

  if (!Array.isArray(catalog)) {
    throw new Error('Rayu entitlements response has no hosted model catalog.');
  }

  return catalog
    .filter((model) => typeof model?.code === 'string' && model.code.length > 0)
    .map((model) => ({
      name: model.code,
      label: model.label || model.code,
      provider: 'Rayu',
      maxTokenAllowed: model.contextWindow ?? 128_000,
      maxCompletionTokens: 16_384,
    }));
}

export function rayuModelInstance(
  model: string,
  token: string | undefined,
  serverEnv?: ServerEnv,
  baseUrlOverride?: string,
): LanguageModelV1 {
  if (!token) {
    throw new Error('Missing Rayu account or API key.');
  }

  const baseURL = `${gatewayUrl(serverEnv, baseUrlOverride)}/anthropic/v1`;
  const provider = createAnthropic({
    apiKey: 'not-used',
    baseURL,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Rayu-Client': 'studio',
      'X-Rayu-Query-Source': 'studio',
    },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.delete('x-api-key');
      headers.set('Authorization', `Bearer ${token}`);

      return compatibleRayuAnthropicResponse(await fetch(input, { ...init, headers }));
    },
  });

  return provider(model);
}

export function readRayuKey(providerName: string, apiKeys?: Record<string, string>): string | undefined {
  return apiKeys?.[providerName];
}
