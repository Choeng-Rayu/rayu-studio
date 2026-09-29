// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const config = {
  mcpServers: {
    Rayu: { type: 'streamable-http', url: 'https://mcp.example.test/mcp' },
  },
};
const connected = {
  Rayu: { status: 'available', tools: { search: {} }, client: {}, config: config.mcpServers.Rayu },
};

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();

  const values = new Map<string, string>([['mcp_settings', JSON.stringify({ mcpConfig: config, maxLLMSteps: 5 })]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

describe('MCP connection store', () => {
  it('does not clear the server-wide MCP service when this browser has no configured servers', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ mcpConfig: { mcpServers: {} }, maxLLMSteps: 5 }),
      setItem: vi.fn(),
    });

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { useMCPStore } = await import('./mcp');

    await useMCPStore.getState().initialize();
    await useMCPStore.getState().checkServersAvailabilities();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useMCPStore.getState().serverTools).toEqual({});
  });

  it('initializes saved connections only once when two views mount together', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(Response.json(connected));
    vi.stubGlobal('fetch', fetchSpy);

    const { useMCPStore } = await import('./mcp');

    await Promise.all([useMCPStore.getState().initialize(), useMCPStore.getState().initialize()]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(useMCPStore.getState().serverTools.Rayu.status).toBe('available');
  });

  it('reconnects from saved configuration when the server process has lost its state', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(Response.json(connected))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json(connected));
    vi.stubGlobal('fetch', fetchSpy);

    const { useMCPStore } = await import('./mcp');

    await useMCPStore.getState().initialize();
    await useMCPStore.getState().checkServersAvailabilities();

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      '/api/mcp-update-config',
      '/api/mcp-check',
      '/api/mcp-update-config',
    ]);
    expect(useMCPStore.getState().settings.mcpConfig.mcpServers.Rayu).toBeDefined();
    expect(useMCPStore.getState().serverTools.Rayu.status).toBe('available');
  });

  it('does not trust live status for a same-named server with different configuration', async () => {
    const otherServer = {
      Rayu: { ...connected.Rayu, config: { type: 'streamable-http', url: 'https://other.example.test/mcp' } },
    };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(Response.json(connected))
      .mockResolvedValueOnce(Response.json(otherServer))
      .mockResolvedValueOnce(Response.json(connected));
    vi.stubGlobal('fetch', fetchSpy);

    const { useMCPStore } = await import('./mcp');

    await useMCPStore.getState().initialize();
    await useMCPStore.getState().checkServersAvailabilities();

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(useMCPStore.getState().serverTools.Rayu.config).toEqual(config.mcpServers.Rayu);
  });
});
