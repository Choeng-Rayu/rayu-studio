import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { deploymentConnections } from '~/lib/stores/deploymentConnections';
import { StudioConnectionSettings } from './StudioConnectionSettings';
import { readDeploymentResponse } from '~/lib/deployment.client';
import { supabaseConnection } from '~/lib/stores/supabase';
import { chatId } from '~/lib/persistence/useChatHistory';
import { updateStudioProject } from '~/lib/studio-projects.client';

export function StudioServiceSettings({ provider }: { provider: 'github' | 'gitlab' | 'supabase' }) {
  const state = useStore(deploymentConnections);
  const currentChatId = useStore(chatId);
  const [resources, setResources] = useState<
    Array<{ id?: string | number; name?: string; full_name?: string; path_with_namespace?: string }>
  >([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const connection = state.connections[provider];
  useEffect(() => {
    setResources([]);
    setError('');
    setSelected('');

    if (connection?.status !== 'connected') {
      return undefined;
    }

    const controller = new AbortController();
    const url =
      provider === 'supabase'
        ? '/api/supabase'
        : `/api/studio/scm/${provider}?operation=${provider === 'github' ? 'repos' : 'projects'}`;
    void fetch(url, {
      signal: controller.signal,
      ...(provider === 'supabase'
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
        : {}),
    })
      .then((response) => readDeploymentResponse<unknown>(response))
      .then((data) => {
        if (!controller.signal.aborted) {
          setResources(
            (Array.isArray(data)
              ? data
              : ((data as { stats?: { projects?: typeof resources } }).stats?.projects ?? [])) as typeof resources,
          );
        }
      })
      .catch((cause: Error) => {
        if (!controller.signal.aborted) {
          setError(cause.message);
        }
      });

    return () => controller.abort();
  }, [provider, state.userId, connection?.revision, connection?.status]);

  const selectSupabase = async (projectId: string) => {
    const owner = state.userId;

    if (!owner || !projectId) {
      return;
    }

    setError('');
    setSelected(projectId);

    try {
      const keys = await readDeploymentResponse<{ apiKeys: Array<{ api_key: string; name: string; type?: string }> }>(
        await fetch('/api/supabase/variables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, expectedUserId: owner }),
        }),
      );

      if (deploymentConnections.get().userId !== owner) {
        throw new Error('Your account changed. Select the project again.');
      }

      supabaseConnection.set({
        user: null,
        token: '',
        isConnected: true,
        selectedProjectId: projectId,
        stats: { projects: resources as never, totalProjects: resources.length },
        credentials: {
          anonKey: keys.apiKeys.find((key) => key.name === 'anon' || key.type === 'publishable')?.api_key,
          supabaseUrl: `https://${projectId}.supabase.co`,
        },
      });

      if (currentChatId) {
        await updateStudioProject(owner, currentChatId, { bindings: { supabaseProjectRef: projectId } });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not select project.');
    }
  };

  return (
    <div className="space-y-4">
      <StudioConnectionSettings provider={provider} />
      {connection?.status === 'connected' && (
        <div className="space-y-2">
          <h4 className="font-medium">{provider === 'supabase' ? 'Database projects' : 'Repositories'}</h4>
          {provider === 'supabase' ? (
            <select
              aria-label="Supabase project"
              value={selected}
              onChange={(event) => void selectSupabase(event.target.value)}
              className="max-w-full p-2 rounded bg-rayu-elements-background-depth-1"
            >
              <option value="">Choose a project</option>
              {resources.map((resource) => (
                <option key={resource.id} value={String(resource.id)}>
                  {resource.name}
                </option>
              ))}
            </select>
          ) : (
            <ul className="max-h-72 overflow-auto">
              {resources.map((resource) => (
                <li key={resource.id || resource.full_name} className="py-1 break-all">
                  {resource.full_name || resource.path_with_namespace || resource.name}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs">Only resources visible to your connected account are listed.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-500 break-words">
          {error}
        </p>
      )}
    </div>
  );
}
