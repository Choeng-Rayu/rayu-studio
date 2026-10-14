import { atom, onMount } from 'nanostores';

export type DeploymentProvider = 'netlify' | 'vercel' | 'cloudflare';
export interface ConnectionProvider {
  kind: string;
  name: string;
  category: string;
  enabled: boolean;
  ready: boolean;
  authMethod: string;
}

export interface DeploymentConnection {
  kind: string;
  maskedToken: string;
  meta: Record<string, string | null> | null;
  status: string;
  revision: number;
  authMethod: string;
}

interface DeploymentConnectionsState {
  userId: number | null;
  connections: Partial<Record<string, DeploymentConnection>>;
  catalog?: ConnectionProvider[];
  oauthError?: { provider: string; userId: number };
  status: 'idle' | 'loading' | 'ready' | 'signed-out' | 'error';
  error: string;
}

export const deploymentConnections = atom<DeploymentConnectionsState>({
  userId: null,
  connections: {},
  status: 'idle',
  error: '',
});

let generation = 0;

export function clearDeploymentConnections() {
  generation++;
  deploymentConnections.set({ userId: null, connections: {}, status: 'idle', error: '' });
}

async function readConnectionResponse(response: Response) {
  const data = (await response.json()) as {
    userId: number;
    connection?: DeploymentConnection;
    connections?: DeploymentConnection[];
    catalog?: ConnectionProvider[];
    oauthError?: { provider: string; userId: number };
    error?: string;
    code?: string;
  };

  if (!response.ok) {
    throw Object.assign(new Error(data.error || 'Could not load deployment connections.'), { code: data.code });
  }

  return data;
}

export async function refreshDeploymentConnections() {
  const requestGeneration = ++generation;
  deploymentConnections.set({ ...deploymentConnections.get(), status: 'loading', error: '' });

  try {
    const data = await readConnectionResponse(await fetch('/api/studio/connections', { cache: 'no-store' }));

    if (requestGeneration !== generation) {
      return;
    }

    deploymentConnections.set({
      userId: data.userId,
      connections: Object.fromEntries((data.connections ?? []).map((connection) => [connection.kind, connection])),
      catalog: data.catalog,
      oauthError: data.oauthError,
      status: 'ready',
      error: '',
    });
  } catch (error) {
    if (requestGeneration !== generation) {
      return;
    }

    const cause = error as Error & { code?: string };
    deploymentConnections.set({
      userId: null,
      connections: {},
      status: cause.code === 'rayu_auth_required' ? 'signed-out' : 'error',
      error: cause.message,
    });
  }
}

export async function connectDeploymentProvider(provider: string, token: string, meta: Record<string, string> = {}) {
  const requestGeneration = ++generation;
  const data = await readConnectionResponse(
    await fetch('/api/deploy-provider-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, token: token.trim(), meta, expectedUserId: deploymentConnections.get().userId }),
    }),
  );

  if (requestGeneration !== generation || !data.connection) {
    throw new Error('Your account changed while connecting. Please retry.');
  }

  const previous = deploymentConnections.get();
  deploymentConnections.set({
    userId: data.userId,
    connections: { ...(previous.userId === data.userId ? previous.connections : {}), [provider]: data.connection },
    catalog: previous.catalog,
    status: 'ready',
    error: '',
  });

  if (provider.startsWith('ai:')) {
    window.dispatchEvent(new Event('studio-connections-change'));
  }

  // Old browser-global connections are never imported into another Rayu account.
  try {
    localStorage.removeItem(`${provider}_connection`);

    if (provider === 'vercel' || provider === 'netlify') {
      document.cookie = `${provider === 'vercel' ? 'VITE_VERCEL_ACCESS_TOKEN' : 'netlifyToken'}=; Max-Age=0; Path=/;`;
    }

    const legacyCookies: Record<string, string[]> = {
      github: ['githubToken', 'git:github.com'],
      gitlab: ['gitlabToken', 'git:gitlab.com'],
      supabase: ['supabaseToken'],
    };

    for (const name of legacyCookies[provider] ?? []) {
      document.cookie = `${name}=; Max-Age=0; Path=/;`;
    }

    if (provider === 'supabase') {
      localStorage.removeItem('supabaseCredentials');
    }
  } catch {
    // The account connection works even when browser storage is unavailable.
  }
}

export async function disconnectDeploymentProvider(provider: string) {
  const requestGeneration = ++generation;
  await readConnectionResponse(
    await fetch('/api/deploy-provider-connect', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, expectedUserId: deploymentConnections.get().userId }),
    }),
  );

  if (requestGeneration !== generation) {
    return;
  }

  const state = deploymentConnections.get();
  const connections = { ...state.connections };
  delete connections[provider];
  deploymentConnections.set({ ...state, connections });

  if (provider.startsWith('ai:')) {
    window.dispatchEvent(new Event('studio-connections-change'));
  }
}

onMount(deploymentConnections, () => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  void refreshDeploymentConnections();

  const accountChanged = () => {
    clearDeploymentConnections();
    void refreshDeploymentConnections();
  };
  window.addEventListener('rayu-auth-change', accountChanged);
  window.addEventListener('focus', accountChanged);

  return () => {
    window.removeEventListener('rayu-auth-change', accountChanged);
    window.removeEventListener('focus', accountChanged);
    clearDeploymentConnections();
  };
});
