import { afterEach, describe, expect, it, vi } from 'vitest';
import { studioCredentials } from './studio-credentials';
import { AI_CONNECTIONS } from '~/lib/studio-connections';
vi.mock('../modules/llm/manager', () => ({ LLMManager: { getInstance: () => ({ env: {} }) } }));
import AnthropicProvider from '~/lib/modules/llm/providers/anthropic';

const auth = {
  accessToken: 'owner-session',
  user: { id: 42, email: null, displayName: null, avatarUrl: null },
  setCookies: [],
};
const env = {
  RAYU_BACKEND_URL: 'https://backend.test/api',
  RAYU_STUDIO_SERVER_SECRET: 'test-server-secret-at-least-32-characters',
};
afterEach(() => vi.unstubAllGlobals());

describe('hosted Studio credential isolation', () => {
  it('keeps repository GitHub separate from GitHub Models across every credential adapter', () => {
    expect(Object.values(AI_CONNECTIONS)).toHaveLength(21);
    expect(AI_CONNECTIONS.Github).toBe('ai:github-models');
    expect(Object.values(AI_CONNECTIONS)).not.toContain('github');
  });
  it('ignores browser-global keys and sends only the dual-auth server request', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        Response.json({ userId: 42, credentials: { Anthropic: { token: 'stored-owner-key', revision: 7, meta: {} } } }),
      );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await studioCredentials(
      new Request('https://studio.rayucode.com', {
        headers: {
          Cookie: `apiKeys=${encodeURIComponent(JSON.stringify({ Anthropic: 'another-accounts-key', OpenAI: 'browser-key' }))}`,
        },
      }),
      env,
      auth,
    );
    expect(result.apiKeys).toEqual({ Rayu: 'owner-session', Anthropic: 'stored-owner-key' });
    expect(result.providerSettings.Anthropic.cacheScope).toBe('42:7');
    expect(fetchSpy.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer owner-session',
      'x-rayu-studio-secret': env.RAYU_STUDIO_SERVER_SECRET,
    });
    expect(fetchSpy.mock.calls[0][1].redirect).toBe('error');
  });
  it('does not resolve credentials while signed out', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await studioCredentials(new Request('https://studio.rayucode.com'), env, null)).apiKeys).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('invalidates models after disconnect/reconnect even when the revision starts at one again', async () => {
    const response = (connectionId: number) =>
      Response.json({
        userId: 42,
        credentials: {
          Anthropic: { token: 'account-key', connectionId, revision: 1, configurationRevision: 'config-v1', meta: {} },
        },
      });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(7)).mockResolvedValueOnce(response(8)));

    const request = new Request('https://studio.rayucode.com');
    const first = await studioCredentials(request, env, auth);
    const second = await studioCredentials(request, env, auth);
    const provider = new AnthropicProvider();
    provider.storeDynamicModels(first, []);
    expect(first.providerSettings.Anthropic.cacheScope).not.toBe(second.providerSettings.Anthropic.cacheScope);
    expect(provider.getModelsFromCache(second)).toBeNull();
  });
  it('fails closed without the separate Studio server secret', async () => {
    await expect(
      studioCredentials(
        new Request('https://studio.rayucode.com'),
        { ...env, RAYU_STUDIO_SERVER_SECRET: 'too-short' },
        auth,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('rejects a mismatched owner instead of accepting their keys', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ userId: 99, credentials: {} })));
    await expect(studioCredentials(new Request('https://studio.rayucode.com'), env, auth)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('never falls back to infrastructure provider keys', () => {
    const provider = new AnthropicProvider();
    expect(() =>
      provider.getProviderBaseUrlAndKey({
        serverEnv: { ANTHROPIC_API_KEY: 'shared-secret' },
        defaultBaseUrlKey: '',
        defaultApiTokenKey: 'ANTHROPIC_API_KEY',
      }),
    ).toThrow('Connect Anthropic');
  });
  it('scopes model caches to the account and revision, without embedding credentials', () => {
    const provider = new AnthropicProvider();
    const options = {
      apiKeys: { Anthropic: 'private-key' },
      providerSettings: { Anthropic: { enabled: true, cacheScope: '42:7' } },
    };
    provider.storeDynamicModels(options, []);
    expect(provider.cachedDynamicModels?.cacheId).not.toContain('private-key');
    expect(
      provider.getModelsFromCache({
        ...options,
        providerSettings: { Anthropic: { enabled: true, cacheScope: '99:7' } },
      }),
    ).toBeNull();
    provider.storeDynamicModels(options, []);
    expect(
      provider.getModelsFromCache({
        ...options,
        providerSettings: { Anthropic: { enabled: true, cacheScope: '42:8' } },
      }),
    ).toBeNull();
  });
});
