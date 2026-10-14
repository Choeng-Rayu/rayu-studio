import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  connectDeploymentProvider,
  deploymentConnections,
  disconnectDeploymentProvider,
  refreshDeploymentConnections,
} from '~/lib/stores/deploymentConnections';
import { readDeploymentResponse } from '~/lib/deployment.client';

export function useStudioRepositoryConnection(provider: 'github' | 'gitlab') {
  const state = useStore(deploymentConnections);
  const record = state.connections[provider];
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setUser(null);
    setError(null);

    if (record?.status !== 'connected') {
      return undefined;
    }

    const controller = new AbortController();
    void fetch(`/api/studio/scm/${provider}?operation=user`, { signal: controller.signal })
      .then((response) => readDeploymentResponse<Record<string, unknown>>(response))
      .then((result) => {
        if (!controller.signal.aborted) {
          setUser(result);
        }
      })
      .catch((cause: Error) => {
        if (!controller.signal.aborted) {
          setError(cause.message);
        }
      });

    return () => controller.abort();
  }, [state.userId, provider, record?.revision, record?.status]);

  return {
    user,
    isConnected: record?.status === 'connected',
    isLoading: state.status === 'loading',
    isConnecting: false,
    error: error || state.error || null,
    isServerSide: true,
    connect: async (token: string) => {
      await connectDeploymentProvider(provider, token);
    },
    disconnect: () => {
      void disconnectDeploymentProvider(provider);
    },
    refreshConnection: refreshDeploymentConnections,
    refreshStats: refreshDeploymentConnections,
    testConnection: async () => {
      const response = await fetch('/api/studio/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, operation: 'check', expectedUserId: state.userId }),
      });
      await refreshDeploymentConnections();

      return response.ok;
    },
  };
}
