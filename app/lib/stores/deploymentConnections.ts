import { atom, onMount } from 'nanostores';

export type DeploymentProvider = 'netlify' | 'vercel';

export interface DeploymentConnection {
  kind: DeploymentProvider;
  maskedToken: string;
  meta: Record<string, string | null> | null;
}

interface DeploymentConnectionsState {
  userId: number | null;
  connections: Partial<Record<DeploymentProvider, DeploymentConnection>>;
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
    const data = await readConnectionResponse(await fetch('/api/deploy-provider-connect', { cache: 'no-store' }));

    if (requestGeneration !== generation) {
      return;
    }

    deploymentConnections.set({
      userId: data.userId,
      connections: Object.fromEntries((data.connections ?? []).map((connection) => [connection.kind, connection])),
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

export async function connectDeploymentProvider(provider: DeploymentProvider, token: string) {
  const requestGeneration = ++generation;
  const data = await readConnectionResponse(
    await fetch('/api/deploy-provider-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, token: token.trim() }),
    }),
  );

  if (requestGeneration !== generation || !data.connection) {
    throw new Error('Your account changed while connecting. Please retry.');
  }

  const previous = deploymentConnections.get();
  deploymentConnections.set({
    userId: data.userId,
    connections: { ...(previous.userId === data.userId ? previous.connections : {}), [provider]: data.connection },
    status: 'ready',
    error: '',
  });

  // Old browser-global connections are never imported into another Rayu account.
  try {
    localStorage.removeItem(`${provider}_connection`);
    document.cookie = `${provider === 'vercel' ? 'VITE_VERCEL_ACCESS_TOKEN' : 'netlifyToken'}=; Max-Age=0; Path=/;`;
  } catch {
    // The account connection works even when browser storage is unavailable.
  }
}

export async function disconnectDeploymentProvider(provider: DeploymentProvider) {
  const requestGeneration = ++generation;
  await readConnectionResponse(
    await fetch('/api/deploy-provider-connect', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    }),
  );

  if (requestGeneration !== generation) {
    return;
  }

  const state = deploymentConnections.get();
  const connections = { ...state.connections };
  delete connections[provider];
  deploymentConnections.set({ ...state, connections });
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
