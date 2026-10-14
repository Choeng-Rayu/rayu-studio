import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Dialog, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Button } from '~/components/ui/Button';
import { StudioConnectionSettings } from './StudioConnectionSettings';
import { deploymentConnections } from '~/lib/stores/deploymentConnections';
import { readDeploymentResponse } from '~/lib/deployment.client';
import { chatId } from '~/lib/persistence/useChatHistory';
import { updateStudioProject } from '~/lib/studio-projects.client';

export function StudioRepositoryDialog({
  provider,
  isOpen,
  onClose,
  projectName,
  files,
}: {
  provider: 'github' | 'gitlab';
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  files: Record<string, string>;
}) {
  const state = useStore(deploymentConnections);
  const [repo, setRepo] = useState(
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '-')
      .slice(0, 100),
  );
  const [branch, setBranch] = useState('main');
  const [privateRepo, setPrivateRepo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const sync = async (event: React.FormEvent) => {
    event.preventDefault();

    const owner = state.userId;
    setBusy(true);
    setError('');

    try {
      const result = await readDeploymentResponse<{ htmlUrl?: string; webUrl?: string }>(
        await fetch(`/api/studio/scm/${provider}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedUserId: owner, repo, files, branch, private: privateRepo }),
        }),
      );

      if (owner !== deploymentConnections.get().userId) {
        throw new Error('Your account changed. Retry.');
      }

      setUrl(result.htmlUrl || result.webUrl || '');

      const currentChatId = chatId.get();

      if (owner && currentChatId) {
        void updateStudioProject(owner, currentChatId, {
          bindings: { repo: result.htmlUrl || result.webUrl || repo, branch },
        }).catch(() => {
          /* Publishing success does not depend on metadata availability. */
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sync failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <Dialog onClose={onClose} className="max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
        <div className="p-6 space-y-3">
          <DialogTitle>Sync code to {provider}</DialogTitle>
          {state.connections[provider]?.status !== 'connected' ? (
            <StudioConnectionSettings provider={provider} />
          ) : (
            <form className="space-y-3" onSubmit={(event) => void sync(event)}>
              <label className="block">
                Repository name
                <input
                  className="w-full p-2 rounded bg-rayu-elements-background-depth-1"
                  required
                  value={repo}
                  onChange={(event) => setRepo(event.target.value)}
                />
              </label>
              <label className="block">
                Branch
                <input
                  className="w-full p-2 rounded bg-rayu-elements-background-depth-1"
                  required
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                />
              </label>
              <label className="block">
                <input
                  type="checkbox"
                  checked={privateRepo}
                  onChange={(event) => setPrivateRepo(event.target.checked)}
                />{' '}
                Private when creating a new repository
              </label>
              <p>
                Existing repositories are updated; source files are transmitted to your provider, not saved in Rayu’s
                database.
              </p>
              <Button type="submit" disabled={busy}>
                {busy ? 'Syncing…' : 'Sync repository'}
              </Button>
            </form>
          )}
          {url && /^https:\/\/(github|gitlab)\.com\//.test(url) && (
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open repository
            </a>
          )}
          {error && (
            <p role="alert" className="text-red-500 break-words">
              {error}
            </p>
          )}
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Close
          </Button>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
