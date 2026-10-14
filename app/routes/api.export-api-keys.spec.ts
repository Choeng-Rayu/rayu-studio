import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loader } from './api.export-api-keys';

beforeEach(() => vi.stubGlobal('__STUDIO_DESKTOP__', true));
afterEach(() => vi.unstubAllGlobals());

describe('API key export', () => {
  it('never exports hosted account credentials or browser-global legacy keys', async () => {
    vi.stubGlobal('__STUDIO_DESKTOP__', false);

    const response = (await loader({
      request: new Request('https://studio.example.com/api/export-api-keys', {
        headers: { Cookie: `apiKeys=${encodeURIComponent(JSON.stringify({ OpenAI: 'private-key' }))}` },
      }),
      context: {},
      params: {},
    } as any)) as Response;
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain('private-key');
  });
  it("returns only the caller's own saved keys, never the server's provider keys", async () => {
    const savedKeys = encodeURIComponent(JSON.stringify({ OpenAI: 'sk-browser-key' }));
    const response = (await loader({
      request: new Request('https://studio.example.com/api/export-api-keys', {
        headers: { Cookie: `apiKeys=${savedKeys}` },
      }),
      context: {
        cloudflare: { env: { OPENAI_API_KEY: 'sk-server-secret', ANTHROPIC_API_KEY: 'sk-ant-server-secret' } },
      },
      params: {},
    } as any)) as Response;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ OpenAI: 'sk-browser-key' });
  });

  it('returns an empty object for a visitor with no saved keys', async () => {
    const response = (await loader({
      request: new Request('https://studio.example.com/api/export-api-keys'),
      context: { cloudflare: { env: { OPENAI_API_KEY: 'sk-server-secret' } } },
      params: {},
    } as any)) as Response;

    expect(await response.json()).toEqual({});
  });
});
