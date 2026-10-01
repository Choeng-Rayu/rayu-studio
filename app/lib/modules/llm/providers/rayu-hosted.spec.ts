import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../manager', () => ({ LLMManager: { getInstance: () => ({ env: {} }) } }));
import RayuHostedProvider from './rayu-hosted';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Rayu hosted provider', () => {
  it('uses only the signed-in session token, not a server-wide auth token', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new RayuHostedProvider();
    const models = await provider.getDynamicModels(undefined, undefined, {
      RAYU_AUTH_TOKEN: 'server-wide-token',
      RAYU_GATEWAY_URL: 'https://gateway.rayucode.com',
    });
    expect(models).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(() => provider.getModelInstance({ model: 'some-model', apiKeys: {} })).toThrow('Missing Rayu account');
  });

  it('does not retain an empty entitlement result and expires a positive catalog', () => {
    vi.useFakeTimers();

    const provider = new RayuHostedProvider();
    const options = { apiKeys: { Rayu: 'session-token' } };
    provider.storeDynamicModels(options, []);
    expect(provider.getModelsFromCache(options)).toBeNull();

    const models = [{ name: 'model-a', label: 'Model A', provider: 'Rayu', maxTokenAllowed: 128000 }];
    provider.storeDynamicModels(options, models);
    expect(provider.getModelsFromCache(options)).toEqual(models);
    vi.advanceTimersByTime(60_001);
    expect(provider.getModelsFromCache(options)).toBeNull();
  });

  it('does not send account tokens to a URL from a provider-settings cookie', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hostedModels: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new RayuHostedProvider();
    await provider.getDynamicModels(
      { Rayu: 'session-token' },
      { baseUrl: 'https://untrusted.example' },
      { RAYU_BACKEND_URL: 'https://api.rayucode.com/api', RAYU_GATEWAY_URL: 'https://gateway.rayucode.com' },
    );
    expect(fetchSpy).toHaveBeenCalledWith('https://api.rayucode.com/api/me/entitlements', expect.any(Object));
  });

  it('lists the full backend hosted catalog even when the plan allows no models', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          plan: { code: 'free' },
          allowedModels: [],
          hostedModels: [{ code: 'model-a', label: 'Model A', contextWindow: 200000 }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new RayuHostedProvider();
    const models = await provider.getDynamicModels({ Rayu: 'session-token' }, undefined, {
      RAYU_BACKEND_URL: 'https://api.rayucode.com/api',
      RAYU_GATEWAY_URL: 'https://gateway.rayucode.com',
    });
    expect(models).toEqual([
      {
        name: 'model-a',
        label: 'Model A',
        provider: 'Rayu',
        maxTokenAllowed: 200000,
        maxCompletionTokens: 16384,
      },
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.rayucode.com/api/me/entitlements',
      expect.objectContaining({
        headers: { Authorization: 'Bearer session-token' },
      }),
    );
  });

  it('lists models the plan can use before the rest of the hosted catalog', async () => {
    /*
     * The client falls back to the FIRST model whenever the remembered one is not in
     * the list; a model outside the plan is a 403 from the gateway on the first prompt.
     */
    const fetchSpy = vi.fn().mockResolvedValue(
      Response.json({
        plan: { code: 'pro' },
        allowedModels: [{ code: 'model-b' }, { code: 'model-d' }],
        hostedModels: [{ code: 'model-a' }, { code: 'model-b' }, { code: 'model-c' }, { code: 'model-d' }],
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new RayuHostedProvider();
    const models = await provider.getDynamicModels({ Rayu: 'session-token' }, undefined, {
      RAYU_BACKEND_URL: 'https://api.rayucode.com/api',
    });

    expect(models.map((model) => model.name)).toEqual(['model-b', 'model-d', 'model-a', 'model-c']);
  });

  it('falls back to the older allowedModels response and rejects a missing catalog', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ allowedModels: [{ code: 'legacy-model' }] }))
      .mockResolvedValueOnce(Response.json({ plan: { code: 'pro' } }));
    vi.stubGlobal('fetch', fetchSpy);

    const provider = new RayuHostedProvider();
    await expect(provider.getDynamicModels({ Rayu: 'session-token' })).resolves.toEqual([
      {
        name: 'legacy-model',
        label: 'legacy-model',
        provider: 'Rayu',
        maxTokenAllowed: 128000,
        maxCompletionTokens: 16384,
      },
    ]);
    await expect(provider.getDynamicModels({ Rayu: 'session-token' })).rejects.toThrow('no hosted model catalog');
  });
});
