import type { MCPConfig, MCPServer, MCPServerTools } from '~/lib/services/mcpService';

/** Saved configuration is authoritative; live status can vanish on server restart. */
export function configuredMcpServerEntries(config: MCPConfig, serverTools: MCPServerTools): [string, MCPServer][] {
  return Object.entries(config?.mcpServers || {}).map(([name, serverConfig]) => [
    name,
    serverTools[name] || {
      status: 'unavailable',
      error: 'Connection status unavailable. Check availability to reconnect.',
      client: null,
      config: serverConfig,
    },
  ]);
}
