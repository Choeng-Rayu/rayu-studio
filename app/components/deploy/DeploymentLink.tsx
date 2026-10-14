import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { existingStudioProject } from '~/lib/studio-projects.client';
import { deploymentConnections, type DeploymentProvider } from '~/lib/stores/deploymentConnections';
import { chatId } from '~/lib/persistence/useChatHistory';
import {
  deploymentRevision,
  getSavedDeployment,
  saveDeployment,
  readDeploymentResponse,
  waitForDeployment,
} from '~/lib/deployment.client';

export function DeploymentLink({ provider }: { provider: DeploymentProvider }) {
  const { userId, status } = useStore(deploymentConnections);
  const currentChatId = useStore(chatId);
  useStore(deploymentRevision);

  const ready = status === 'ready';
  useEffect(() => {
    if (!userId || !currentChatId || status !== 'ready') {
      return undefined;
    }

    const projectId = existingStudioProject(userId, currentChatId);

    if (!projectId) {
      return undefined;
    }

    let active = true;
    void (async () => {
      const records = await readDeploymentResponse<
        Array<{
          provider: string;
          deployId: string | null;
          targetId: string | null;
          url: string | null;
          status: string;
        }>
      >(await fetch(`/api/studio/projects?${new URLSearchParams({ projectId })}`, { cache: 'no-store' }));
      const record = records.find((item) => item.provider === provider && item.deployId);

      if (!active || !record?.deployId || deploymentConnections.get().userId !== userId) {
        return;
      }

      const result = {
        deployId: record.deployId,
        url: record.url,
        ...(provider === 'netlify'
          ? { siteId: record.targetId ?? undefined }
          : { projectId: record.targetId ?? undefined }),
      };
      saveDeployment(userId, provider, currentChatId, result);

      if (record.status === 'processing') {
        const completed = await waitForDeployment(provider, result);

        if (active && deploymentConnections.get().userId === userId) {
          saveDeployment(userId, provider, currentChatId, completed);
        }
      }
    })().catch(() => {
      /* A recovery failure does not erase the last published URL. */
    });

    return () => {
      active = false;
    };
  }, [userId, currentChatId, provider, ready]);

  const url =
    status === 'ready' && userId && currentChatId ? getSavedDeployment(userId, provider, currentChatId)?.url : null;

  if (!url || !url.startsWith('https://')) {
    return null;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${provider} deployment`}
      title={url}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-rayu-elements-item-backgroundActive"
    >
      <span className="i-ph:link" />
    </a>
  );
}
