import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from './api.models';

afterEach(() => vi.unstubAllGlobals());

describe('Rayu hosted model route', () => {
  it('shows the backend catalog after login without treating Free models as usable', async () => {
    const accessToken = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
    const entitlements = {
      plan: { code: 'free' },
      topupBalance: 0,
      allowedModels: [],
      hostedModels: [{ code: 'model-a', label: 'Model A', contextWindow: 200000 }],
    };
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/me')) {
        return Response.json({ user: { id: 42, email: 'rayu@example.com' } });
      }

      if (url.endsWith('/me/entitlements')) {
        return Response.json(entitlements);
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const response = await loader({
      request: new Request('https://studio.rayucode.com/api/models/Rayu', {
        headers: { Cookie: `rayu_access=${accessToken}; rayu_refresh=refresh-token` },
      }),
      params: { provider: 'Rayu' },
      context: { cloudflare: { env: { RAYU_BACKEND_URL: 'https://api.rayucode.com/api' } } },
    });
    const payload = (await response.json()) as {
      modelList: Array<{ name: string; label: string; provider: string }>;
      rayuStatus: string;
    };
    expect(response.status).toBe(200);
    expect(payload.modelList).toEqual([
      expect.objectContaining({ name: 'model-a', label: 'Model A', provider: 'Rayu' }),
    ]);
    expect(payload.rayuStatus).toBe('upgrade-required');
    expect(fetchSpy).not.toHaveBeenCalledWith('https://gateway.rayucode.com/v1/models', expect.anything());
  });

  it('explains when the separate Rayu API Key provider has no key', async () => {
    const response = await loader({
      request: new Request('https://studio.rayucode.com/api/models/Rayu%20API%20Key'),
      params: { provider: 'Rayu API Key' },
      context: { cloudflare: { env: { RAYU_GATEWAY_URL: 'https://gateway.rayucode.com' } } },
    });
    const payload = (await response.json()) as { modelList: unknown[]; providerError?: string };
    expect(payload.modelList).toEqual([]);
    expect(payload.providerError).toContain('Add a Rayu API key');
  });

  it('loads API-key models from the gateway when a key is configured', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ id: 'model-key', label: 'Model Key', contextWindow: 128000 }],
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const keyCookie = encodeURIComponent(JSON.stringify({ 'Rayu API Key': 'rayu_sk_live_test' }));
    const response = await loader({
      request: new Request('https://studio.rayucode.com/api/models/Rayu%20API%20Key', {
        headers: { Cookie: `apiKeys=${keyCookie}` },
      }),
      params: { provider: 'Rayu API Key' },
      context: { cloudflare: { env: { RAYU_GATEWAY_URL: 'https://gateway.rayucode.com' } } },
    });
    const payload = (await response.json()) as { modelList: Array<{ name: string; provider: string }> };
    expect(payload.modelList).toEqual([expect.objectContaining({ name: 'model-key', provider: 'Rayu API Key' })]);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://gateway.rayucode.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer rayu_sk_live_test' }),
      }),
    );
  });
});
