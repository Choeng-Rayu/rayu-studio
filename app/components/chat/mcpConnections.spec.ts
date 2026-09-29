import { describe, expect, it } from 'vitest';
import { configuredMcpServerEntries } from './mcpConnections';

describe('configured MCP connections', () => {
  it('keeps a saved server visible when live status disappears', () => {
    const entries = configuredMcpServerEntries(
      {
        mcpServers: { Rayu: { type: 'streamable-http', url: 'https://mcp.example.test/mcp' } },
      },
      {},
    );

    expect(entries).toHaveLength(1);
    expect(entries[0][0]).toBe('Rayu');
    expect(entries[0][1].status).toBe('unavailable');
    expect(entries[0][1]).toHaveProperty('error', expect.stringContaining('Connection status unavailable'));
  });

  it('does not show a server that is not in this browser’s configuration', () => {
    expect(
      configuredMcpServerEntries(
        { mcpServers: {} },
        {
          Other: { status: 'unavailable', error: 'stale', client: null, config: { type: 'stdio', command: 'node' } },
        },
      ),
    ).toEqual([]);
  });
});
