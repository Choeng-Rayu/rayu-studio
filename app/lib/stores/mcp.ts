import { create } from 'zustand';
import type { MCPConfig, MCPServerConfig, MCPServerTools } from '~/lib/services/mcpService';

const MCP_SETTINGS_KEY = 'mcp_settings';
const isBrowser = typeof window !== 'undefined';

type MCPSettings = {
  mcpConfig: MCPConfig;
  maxLLMSteps: number;
};

const defaultSettings = {
  maxLLMSteps: 5,
  mcpConfig: {
    mcpServers: {},
  },
} satisfies MCPSettings;

let initializePromise: Promise<void> | null = null;

function sameServerConfig(left: MCPServerConfig, right?: MCPServerConfig): boolean {
  if (!right) {
    return false;
  }

  const comparable = (config: MCPServerConfig) => ({
    type: config.type || ('command' in config ? 'stdio' : undefined),
    command: 'command' in config ? config.command : undefined,
    args: 'args' in config ? config.args : undefined,
    cwd: 'cwd' in config ? config.cwd : undefined,
    env: 'env' in config ? config.env : undefined,
    url: 'url' in config ? config.url : undefined,
    headers: 'headers' in config ? config.headers : undefined,
  });

  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

type Store = {
  isInitialized: boolean;
  settings: MCPSettings;
  serverTools: MCPServerTools;
  error: string | null;
  isUpdatingConfig: boolean;
};

type Actions = {
  initialize: () => Promise<void>;
  updateSettings: (settings: MCPSettings) => Promise<void>;
  checkServersAvailabilities: () => Promise<void>;
};

export const useMCPStore = create<Store & Actions>((set, get) => ({
  isInitialized: false,
  settings: defaultSettings,
  serverTools: {},
  error: null,
  isUpdatingConfig: false,
  initialize: () => {
    if (get().isInitialized) {
      return Promise.resolve();
    }

    if (initializePromise) {
      return initializePromise;
    }

    /*
     * The chat dialog and Settings tab may mount together. Share one request
     * so concurrent initialization cannot close each other's MCP clients.
     */
    initializePromise = (async () => {
      if (isBrowser) {
        const savedConfig = localStorage.getItem(MCP_SETTINGS_KEY);

        if (savedConfig) {
          try {
            const settings = JSON.parse(savedConfig) as MCPSettings;
            set(() => ({ settings }));

            if (Object.keys(settings.mcpConfig?.mcpServers || {}).length > 0) {
              const serverTools = await updateServerConfig(settings.mcpConfig);
              set(() => ({ serverTools, error: null }));
            } else {
              /*
               * An empty config in a different tab must not close connections
               * held by the server-wide MCP service.
               */
              set(() => ({ serverTools: {}, error: null }));
            }
          } catch (error) {
            console.error('Error loading saved MCP config:', error);
            set(() => ({
              error: `Could not load MCP connections: ${error instanceof Error ? error.message : String(error)}`,
            }));
          }
        } else {
          localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(defaultSettings));
        }
      }

      set(() => ({ isInitialized: true }));
    })().finally(() => {
      initializePromise = null;
    });

    return initializePromise;
  },
  updateSettings: async (newSettings: MCPSettings) => {
    if (initializePromise) {
      await initializePromise;
    }

    if (get().isUpdatingConfig) {
      return;
    }

    try {
      set(() => ({ isUpdatingConfig: true }));

      const serverTools = await updateServerConfig(newSettings.mcpConfig);

      if (isBrowser) {
        localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(newSettings));
      }

      set(() => ({ settings: newSettings, serverTools, error: null }));
    } catch (error) {
      throw error;
    } finally {
      set(() => ({ isUpdatingConfig: false }));
    }
  },
  checkServersAvailabilities: async () => {
    if (initializePromise) {
      await initializePromise;
    }

    const config = get().settings.mcpConfig;
    const configuredNames = Object.keys(config?.mcpServers || {});

    if (configuredNames.length === 0) {
      set(() => ({ serverTools: {}, error: null }));
      return;
    }

    try {
      const response = await fetch('/api/mcp-check', { method: 'GET' });

      if (!response.ok) {
        throw mcpRequestError(response);
      }

      let serverTools = (await response.json()) as MCPServerTools;

      if (configuredNames.some((name) => !sameServerConfig(config.mcpServers[name], serverTools[name]?.config))) {
        /*
         * Remix/Workers can restart and lose the process-local MCP service.
         * Restore it from the browser's saved configuration before reporting
         * that the user's servers disappeared.
         */
        serverTools = await updateServerConfig(config);
      }

      set(() => ({ serverTools, error: null }));
    } catch (error) {
      set(() => ({ serverTools: {}, error: error instanceof Error ? error.message : String(error) }));
      throw error;
    }
  },
}));

/** MCP connections are per Rayu account on the server, so a signed-out browser gets 401. */
function mcpRequestError(response: Response): Error {
  if (response.status === 401) {
    return new Error('Sign in to Rayu to connect MCP servers.');
  }

  return new Error(`Server responded with ${response.status}: ${response.statusText}`);
}

async function updateServerConfig(config: MCPConfig) {
  const response = await fetch('/api/mcp-update-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw mcpRequestError(response);
  }

  const data = (await response.json()) as MCPServerTools;

  return data;
}
