import { useState, useId } from 'react';
import { useStore } from '@nanostores/react';
import { Button } from '~/components/ui/Button';
import { startRayuSignIn } from '~/lib/rayu-auth.client';
import {
  connectDeploymentProvider,
  deploymentConnections,
  disconnectDeploymentProvider,
  refreshDeploymentConnections,
  type DeploymentProvider,
} from '~/lib/stores/deploymentConnections';

export function DeploymentProviderSettings({
  provider,
  onContinue,
}: {
  provider: DeploymentProvider;
  onContinue?: () => void;
}) {
  const state = useStore(deploymentConnections);
  const connection = state.connections[provider];
  const name = provider === 'netlify' ? 'Netlify' : 'Vercel';
  const tokenUrl =
    provider === 'netlify'
      ? 'https://app.netlify.com/user/applications#personal-access-tokens'
      : 'https://vercel.com/account/tokens';
  const tokenId = useId();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await connectDeploymentProvider(provider, token);
      setToken('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect. Please retry.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError('');

    try {
      await disconnectDeploymentProvider(provider);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect.');
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    setError('');

    try {
      await startRayuSignIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start sign-in.');
    }
  };

  return (
    <div className="space-y-4 text-sm text-rayu-elements-textPrimary">
      {state.status === 'loading' || state.status === 'idle' ? (
        <p role="status" className="text-rayu-elements-textSecondary">
          Checking your connection…
        </p>
      ) : state.status === 'signed-out' ? (
        <>
          <p>Sign in to RayuCode to save your {name} connection to your account.</p>
          <Button onClick={() => void signIn()}>Sign in to RayuCode</Button>
        </>
      ) : state.status === 'error' ? (
        <>
          <p role="alert" className="text-red-500">
            {state.error}
          </p>
          <Button onClick={() => void refreshDeploymentConnections()}>Retry</Button>
        </>
      ) : connection ? (
        <>
          <p role="status">
            Connected to {name} as{' '}
            <strong>
              {connection.meta?.email || connection.meta?.username || connection.meta?.name || 'your account'}
            </strong>
            .
          </p>
          <p className="text-rayu-elements-textSecondary">
            This connection belongs to your RayuCode account and is available when you sign in on another device.
          </p>
          <div className="flex flex-wrap gap-2">
            {onContinue && (
              <Button disabled={busy} onClick={onContinue} className="bg-accent-500 text-white hover:bg-accent-600">
                Deploy now
              </Button>
            )}
            <Button variant="outline" disabled={busy} onClick={() => void disconnect()}>
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        </>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void connect(event)}>
          <p>Connect your own {name} account to publish this project.</p>
          <ol className="list-decimal space-y-2 pl-5 text-rayu-elements-textSecondary">
            <li>
              <a href={tokenUrl} target="_blank" rel="noopener noreferrer" className="text-accent-500 underline">
                Open {name} token settings
              </a>{' '}
              and create a personal access token.
            </li>
            <li>Copy the token and paste it below.</li>
          </ol>
          <div className="space-y-2">
            <label htmlFor={tokenId} className="block">
              {name} personal access token
            </label>
            <input
              id={tokenId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              disabled={busy}
              onChange={(event) => setToken(event.target.value)}
              placeholder={`Paste your ${name} token`}
              className="w-full min-w-0 rounded-md border border-rayu-elements-borderColor bg-rayu-elements-background-depth-1 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>
          <p className="text-xs text-rayu-elements-textSecondary">
            Your token is saved securely to your RayuCode account. Other Studio users cannot use it.
          </p>
          <Button
            type="submit"
            disabled={busy || !token.trim()}
            className="bg-accent-500 text-white hover:bg-accent-600"
          >
            {busy ? 'Connecting…' : `Connect ${name}`}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="break-words text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
