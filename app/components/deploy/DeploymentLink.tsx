import { useStore } from '@nanostores/react';
import { deploymentConnections, type DeploymentProvider } from '~/lib/stores/deploymentConnections';
import { chatId } from '~/lib/persistence/useChatHistory';
import { deploymentRevision, getSavedDeployment } from '~/lib/deployment.client';

export function DeploymentLink({ provider }: { provider: DeploymentProvider }) {
  const { userId, status } = useStore(deploymentConnections);
  const currentChatId = useStore(chatId);
  useStore(deploymentRevision);

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
