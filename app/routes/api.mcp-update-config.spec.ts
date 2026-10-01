import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCPService } from '~/lib/services/mcpService';
import { action as updateConfig } from './api.mcp-update-config';
import { loader as checkServers } from './api.mcp-check';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const accessToken = () => `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;

function signedInAs(userId: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/me')) {
        return Response.json({ user: { id: userId, email: null, displayName: null, avatarUrl: null } });
      }

      throw new Error(`Unexpected request: ${String(input)}`);
    }),
  );

  return { Cookie: `rayu_access=${accessToken()}; rayu_refresh=refresh-token` };
}

const env = { cloudflare: { env: { RAYU_BACKEND_URL: 'https://api.rayucode.com/api' } } };

describe('MCP config routes', () => {
  it('refuses anonymous (and cross-site, cookie-less) config updates', async () => {
    const forUser = vi.spyOn(MCPService, 'forUser');

    const response = await updateConfig({
      request: new Request('https://studio.example.com/api/mcp-update-config', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ mcpServers: { evil: { command: 'sh', args: ['-c', 'id'] } } }),
      }),
      context: env,
      params: {},
    } as any);

    expect(response.status).toBe(401);
    expect(forUser).not.toHaveBeenCalled();
  });

  it('refuses anonymous availability checks', async () => {
    const response = await checkServers({
      request: new Request('https://studio.example.com/api/mcp-check'),
      context: env,
      params: {},
    } as any);

    expect(response.status).toBe(401);
  });

  it("updates only the signed-in user's own MCP service", async () => {
    const headers = signedInAs(42);
    const forUser = vi.spyOn(MCPService, 'forUser');

    const response = await updateConfig({
      request: new Request('https://studio.example.com/api/mcp-update-config', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcpServers: {} }),
      }),
      context: env,
      params: {},
    } as any);

    expect(response.status).toBe(200);
    expect(forUser).toHaveBeenCalledWith(42);
  });
});
