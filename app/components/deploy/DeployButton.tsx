import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useStore } from '@nanostores/react';
import { deploymentConnections } from '~/lib/stores/deploymentConnections';
import { isStudioDesktop } from '~/lib/studio-connections';
import { isGitLabConnected } from '~/lib/stores/gitlabConnection';
import { workbenchStore } from '~/lib/stores/workbench';
import { streamingState } from '~/lib/stores/streaming';
import { classNames } from '~/utils/classNames';
import { readDeploymentResponse } from '~/lib/deployment.client';
import { Button } from '~/components/ui/Button';
import { useState } from 'react';
import { DeploymentLink } from './DeploymentLink';
import { StudioConnectionSettings } from './StudioConnectionSettings';
import { Dialog, DialogRoot, DialogTitle, DialogDescription } from '~/components/ui/Dialog';
import { useVercelDeploy } from '~/components/deploy/VercelDeploy.client';
import { useNetlifyDeploy } from '~/components/deploy/NetlifyDeploy.client';
import { useGitHubDeploy } from '~/components/deploy/GitHubDeploy.client';
import { useGitLabDeploy } from '~/components/deploy/GitLabDeploy.client';
import { GitHubDeploymentDialog } from '~/components/deploy/GitHubDeploymentDialog';
import { GitLabDeploymentDialog } from '~/components/deploy/GitLabDeploymentDialog';

interface DeployButtonProps {
  onVercelDeploy?: () => Promise<void>;
  onNetlifyDeploy?: () => Promise<void>;
  onGitHubDeploy?: () => Promise<void>;
  onGitLabDeploy?: () => Promise<void>;
}

export const DeployButton = ({
  onVercelDeploy,
  onNetlifyDeploy,
  onGitHubDeploy,
  onGitLabDeploy,
}: DeployButtonProps) => {
  const connectionState = useStore(deploymentConnections);
  const netlifyConnected =
    connectionState.status === 'ready' && connectionState.connections.netlify?.status === 'connected';
  const vercelConnected =
    connectionState.status === 'ready' && connectionState.connections.vercel?.status === 'connected';
  const [connectingProvider, setConnectingProvider] = useState<
    'netlify' | 'vercel' | 'cloudflare' | 'github' | 'gitlab' | null
  >(null);
  const legacyGitLabConnected = useStore(isGitLabConnected);
  const gitlabIsConnected = isStudioDesktop()
    ? legacyGitLabConnected
    : connectionState.connections.gitlab?.status === 'connected';
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  useStore(workbenchStore.artifacts);

  const activePreview = previews[activePreviewIndex];
  const hasProject = Boolean(workbenchStore.firstArtifact);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployingTo, setDeployingTo] = useState<'netlify' | 'vercel' | 'cloudflare' | 'github' | 'gitlab' | null>(
    null,
  );
  const isStreaming = useStore(streamingState);
  const { handleVercelDeploy } = useVercelDeploy();
  const { handleNetlifyDeploy } = useNetlifyDeploy();
  const { handleNetlifyDeploy: handleCloudflareDeploy } = useNetlifyDeploy('cloudflare');
  const [cloudflareSetup, setCloudflareSetup] = useState(false);
  const [cloudflareAccounts, setCloudflareAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [cloudflareAccount, setCloudflareAccount] = useState('');
  const [cloudflareProject, setCloudflareProject] = useState(() => `rayu-studio-${crypto.randomUUID().slice(0, 8)}`);
  const [cloudflareError, setCloudflareError] = useState('');
  const [cloudflareLoading, setCloudflareLoading] = useState(false);
  const [cloudflareOwner, setCloudflareOwner] = useState<number | null>(null);
  const handleCloudflareDeployClick = async () => {
    if (connectionState.connections.cloudflare?.status !== 'connected') {
      setConnectingProvider('cloudflare');
      return;
    }

    setConnectingProvider(null);
    setCloudflareSetup(true);
    setCloudflareLoading(true);
    setCloudflareError('');

    const owner = connectionState.userId;
    setCloudflareOwner(owner);

    try {
      const accounts = await readDeploymentResponse<Array<{ id: string; name: string }>>(
        await fetch('/api/cloudflare-accounts', { cache: 'no-store' }),
      );

      if (owner !== deploymentConnections.get().userId) {
        throw new Error('Your account changed. Reconnect first.');
      }

      setCloudflareAccounts(accounts);
      setCloudflareAccount(accounts[0]?.id ?? '');

      if (!accounts.length) {
        setCloudflareError('No Cloudflare accounts available. Reconnect with account and Pages permissions.');
      }
    } catch (cause) {
      setCloudflareError(cause instanceof Error ? cause.message : 'Could not load Cloudflare accounts.');
    } finally {
      setCloudflareLoading(false);
    }
  };
  const publishCloudflare = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!cloudflareOwner || cloudflareOwner !== deploymentConnections.get().userId) {
      setCloudflareError('Your account changed. Refresh accounts before publishing.');
      return;
    }

    setCloudflareSetup(false);
    setIsDeploying(true);
    setDeployingTo('cloudflare');

    try {
      await handleCloudflareDeploy({ accountId: cloudflareAccount, projectName: cloudflareProject });
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };
  const { handleGitHubDeploy } = useGitHubDeploy();
  const { handleGitLabDeploy } = useGitLabDeploy();
  const [showGitHubDeploymentDialog, setShowGitHubDeploymentDialog] = useState(false);
  const [showGitLabDeploymentDialog, setShowGitLabDeploymentDialog] = useState(false);
  const [githubDeploymentFiles, setGithubDeploymentFiles] = useState<Record<string, string> | null>(null);
  const [gitlabDeploymentFiles, setGitlabDeploymentFiles] = useState<Record<string, string> | null>(null);
  const [githubProjectName, setGithubProjectName] = useState('');
  const [gitlabProjectName, setGitlabProjectName] = useState('');

  const handleVercelDeployClick = async () => {
    if (!vercelConnected) {
      setConnectingProvider('vercel');
      return;
    }

    setConnectingProvider(null);
    setIsDeploying(true);
    setDeployingTo('vercel');

    try {
      if (onVercelDeploy) {
        await onVercelDeploy();
      } else {
        await handleVercelDeploy();
      }
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const handleNetlifyDeployClick = async () => {
    if (!netlifyConnected) {
      setConnectingProvider('netlify');
      return;
    }

    setConnectingProvider(null);
    setIsDeploying(true);
    setDeployingTo('netlify');

    try {
      if (onNetlifyDeploy) {
        await onNetlifyDeploy();
      } else {
        await handleNetlifyDeploy();
      }
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const handleGitHubDeployClick = async () => {
    if (!isStudioDesktop() && connectionState.connections.github?.status !== 'connected') {
      setConnectingProvider('github');
      return;
    }

    setConnectingProvider(null);
    setIsDeploying(true);
    setDeployingTo('github');

    try {
      if (onGitHubDeploy) {
        await onGitHubDeploy();
      } else {
        const result = await handleGitHubDeploy();

        if (result && result.success && result.files) {
          setGithubDeploymentFiles(result.files);
          setGithubProjectName(result.projectName);
          setShowGitHubDeploymentDialog(true);
        }
      }
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const handleGitLabDeployClick = async () => {
    if (!isStudioDesktop() && connectionState.connections.gitlab?.status !== 'connected') {
      setConnectingProvider('gitlab');
      return;
    }

    setConnectingProvider(null);
    setIsDeploying(true);
    setDeployingTo('gitlab');

    try {
      if (onGitLabDeploy) {
        await onGitLabDeploy();
      } else {
        const result = await handleGitLabDeploy();

        if (result && result.success && result.files) {
          setGitlabDeploymentFiles(result.files);
          setGitlabProjectName(result.projectName);
          setShowGitLabDeploymentDialog(true);
        }
      }
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  return (
    <>
      <DialogRoot open={cloudflareSetup} onOpenChange={setCloudflareSetup}>
        {cloudflareSetup && (
          <Dialog
            onClose={() => setCloudflareSetup(false)}
            className="max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto"
          >
            <form onSubmit={(event) => void publishCloudflare(event)} className="p-6 space-y-4">
              <DialogTitle>Publish to Cloudflare Pages</DialogTitle>
              <DialogDescription>
                Build your static website in this browser, then publish using your connected account.
              </DialogDescription>
              <label className="block text-sm">
                Account
                <select
                  required
                  value={cloudflareAccount}
                  onChange={(event) => setCloudflareAccount(event.target.value)}
                  className="mt-1 w-full min-w-0 rounded p-2 bg-rayu-elements-background-depth-1"
                >
                  <option value="">Choose an account</option>
                  {cloudflareAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Pages project
                <input
                  required
                  minLength={2}
                  maxLength={60}
                  pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                  value={cloudflareProject}
                  onChange={(event) => setCloudflareProject(event.target.value)}
                  className="mt-1 w-full min-w-0 rounded p-2 bg-rayu-elements-background-depth-1"
                />
              </label>
              <p className="text-xs">
                Existing projects with this name are updated. Server functions are not supported.
              </p>
              {cloudflareLoading && <p role="status">Loading your accounts…</p>}
              {cloudflareError && (
                <p role="alert" className="break-words text-red-500">
                  {cloudflareError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={cloudflareLoading || !cloudflareAccount || isDeploying}>
                  Build and publish
                </Button>
                <Button type="button" variant="outline" onClick={() => void handleCloudflareDeployClick()}>
                  Refresh accounts
                </Button>
                <Button type="button" variant="outline" onClick={() => setCloudflareSetup(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Dialog>
        )}
      </DialogRoot>
      <div className="flex border border-rayu-elements-borderColor rounded-md overflow-hidden text-sm">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            disabled={isDeploying || (!activePreview && !hasProject) || isStreaming}
            className="rounded-md items-center justify-center [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-60 px-3 py-1.5 text-xs bg-accent-500 text-white hover:text-rayu-elements-item-contentAccent [&:not(:disabled,.disabled)]:hover:bg-rayu-elements-button-primary-backgroundHover outline-accent-500 flex gap-1.7"
          >
            {isDeploying ? `Deploying to ${deployingTo}...` : 'Deploy'}
            <span className={classNames('i-ph:caret-down transition-transform')} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            className={classNames(
              'z-[250]',
              'bg-rayu-elements-background-depth-2',
              'rounded-lg shadow-lg',
              'border border-rayu-elements-borderColor',
              'animate-in fade-in-0 zoom-in-95',
              'py-1',
            )}
            sideOffset={5}
            align="end"
          >
            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-rayu-elements-textPrimary hover:bg-rayu-elements-item-backgroundActive gap-2 rounded-md group relative',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !hasProject,
                },
              )}
              disabled={isDeploying || !hasProject}
              onSelect={() => void handleNetlifyDeployClick()}
            >
              <img
                className="w-5 h-5"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/netlify"
                alt=""
              />
              <span className="mx-auto">{!netlifyConnected ? 'Connect Netlify' : 'Deploy to Netlify'}</span>
              {netlifyConnected && <DeploymentLink provider="netlify" />}
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-rayu-elements-textPrimary hover:bg-rayu-elements-item-backgroundActive gap-2 rounded-md group relative',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !hasProject,
                },
              )}
              disabled={isDeploying || !hasProject}
              onSelect={() => void handleVercelDeployClick()}
            >
              <img
                className="w-5 h-5 bg-black p-1 rounded"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/vercel/white"
                alt=""
              />
              <span className="mx-auto">{!vercelConnected ? 'Connect Vercel' : 'Deploy to Vercel'}</span>
              {vercelConnected && <DeploymentLink provider="vercel" />}
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-rayu-elements-textPrimary hover:bg-rayu-elements-item-backgroundActive gap-2 rounded-md group relative',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview,
                },
              )}
              disabled={isDeploying || !activePreview}
              onClick={handleGitHubDeployClick}
            >
              <img
                className="w-5 h-5"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/github"
                alt=""
              />
              <span className="mx-auto">Sync code to GitHub</span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={classNames(
                'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-rayu-elements-textPrimary hover:bg-rayu-elements-item-backgroundActive gap-2 rounded-md group relative',
                {
                  'opacity-60 cursor-not-allowed': isDeploying || !activePreview || !gitlabIsConnected,
                },
              )}
              disabled={isDeploying || !activePreview}
              onClick={handleGitLabDeployClick}
            >
              <img
                className="w-5 h-5"
                height="24"
                width="24"
                crossOrigin="anonymous"
                src="https://cdn.simpleicons.org/gitlab"
                alt=""
              />
              <span className="mx-auto">
                {!gitlabIsConnected ? 'No GitLab Account Connected' : 'Sync code to GitLab'}
              </span>
            </DropdownMenu.Item>

            {!isStudioDesktop() && (
              <DropdownMenu.Item
                disabled={isDeploying || !hasProject}
                onSelect={() => void handleCloudflareDeployClick()}
                className="cursor-pointer flex items-center w-full rounded-md px-4 py-2 text-sm text-rayu-elements-textPrimary hover:bg-rayu-elements-item-backgroundActive gap-2 data-[disabled]:opacity-60 data-[disabled]:cursor-not-allowed"
              >
                <img
                  className="w-5 h-5"
                  height="24"
                  width="24"
                  crossOrigin="anonymous"
                  src="https://cdn.simpleicons.org/cloudflare"
                  alt=""
                />
                <span className="mx-auto">
                  {connectionState.connections.cloudflare ? 'Deploy to Cloudflare Pages' : 'Connect Cloudflare Pages'}
                </span>
                <DeploymentLink provider="cloudflare" />
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      <DialogRoot
        open={connectingProvider !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConnectingProvider(null);
          }
        }}
      >
        {connectingProvider && (
          <Dialog
            className="max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto"
            onClose={() => setConnectingProvider(null)}
          >
            <div className="p-6">
              <DialogTitle>Connect {connectingProvider}</DialogTitle>
              <DialogDescription className="mb-5">Publish using your own hosting account.</DialogDescription>
              <StudioConnectionSettings
                key={connectingProvider}
                provider={connectingProvider}
                onContinue={() =>
                  void {
                    netlify: handleNetlifyDeployClick,
                    vercel: handleVercelDeployClick,
                    cloudflare: handleCloudflareDeployClick,
                    github: handleGitHubDeployClick,
                    gitlab: handleGitLabDeployClick,
                  }[connectingProvider]?.()
                }
              />
            </div>
          </Dialog>
        )}
      </DialogRoot>

      {/* GitHub Deployment Dialog */}
      {showGitHubDeploymentDialog && githubDeploymentFiles && (
        <GitHubDeploymentDialog
          isOpen={showGitHubDeploymentDialog}
          onClose={() => setShowGitHubDeploymentDialog(false)}
          projectName={githubProjectName}
          files={githubDeploymentFiles}
        />
      )}

      {/* GitLab Deployment Dialog */}
      {showGitLabDeploymentDialog && gitlabDeploymentFiles && (
        <GitLabDeploymentDialog
          isOpen={showGitLabDeploymentDialog}
          onClose={() => setShowGitLabDeploymentDialog(false)}
          projectName={gitlabProjectName}
          files={gitlabDeploymentFiles}
        />
      )}
    </>
  );
};
