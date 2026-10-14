import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button } from '~/components/ui/Button';
import { startRayuSignIn } from '~/lib/rayu-auth.client';
import {
  connectDeploymentProvider,
  deploymentConnections,
  disconnectDeploymentProvider,
  refreshDeploymentConnections,
} from '~/lib/stores/deploymentConnections';
import { AI_CONNECTIONS, SERVICE_CONNECTIONS } from '~/lib/studio-connections';
import Cookies from 'js-cookie';

export function StudioConnectionSettings({ provider, onContinue }: { provider: string; onContinue?: () => void }) {
  const state = useStore(deploymentConnections);
  const connection = state.connections[provider];
  const descriptor = state.catalog?.find((item) => item.kind === provider);
  const isService = (SERVICE_CONNECTIONS as readonly string[]).includes(provider);
  const name = descriptor?.name ?? provider;
  const id = useId();
  const [token, setToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [migrate, setMigrate] = useState(false);
  const active = useRef(true);
  const popup = useRef<Window | null>(null);
  const pending = useRef<{ owner: number; revision: number; provider: string } | null>(null);
  const continuation = useRef(onContinue);
  continuation.current = onContinue;
  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
      popup.current?.close();
    };
  }, []);
  useEffect(() => {
    const operation = pending.current;

    if (!operation || state.status !== 'ready') {
      return;
    }

    if (state.userId !== operation.owner || operation.provider !== provider) {
      pending.current = null;
      setWaiting(false);
      popup.current?.close();
      setError('Your account changed. Connect again.');
    } else if (state.oauthError?.provider === provider && state.oauthError.userId === operation.owner) {
      pending.current = null;
      setWaiting(false);
      popup.current?.close();
      setError('Authorization was cancelled, expired, or rejected. Connect again.');
    } else if (connection?.status === 'connected' && connection.revision > operation.revision) {
      pending.current = null;
      setWaiting(false);
      popup.current?.close();
      continuation.current?.();
    }
  }, [connection?.revision, connection?.status, state.status, state.userId, state.oauthError, provider]);
  useEffect(() => {
    if (!waiting) {
      return undefined;
    }

    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 600_000) {
        pending.current = null;
        setWaiting(false);
        setError('Authorization timed out. Connect again.');
      } else {
        void refreshDeploymentConnections();
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [waiting]);

  const operation = async (action: 'oauth' | 'check') => {
    if (!state.userId) {
      return;
    }

    const owner = state.userId;

    if (action === 'oauth') {
      popup.current = window.open('about:blank', '_blank', 'popup,width=600,height=760');

      if (!popup.current) {
        setError('Allow popups for Studio, then connect again.');
        return;
      }

      pending.current = { owner, revision: connection?.revision ?? 0, provider };
    }

    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/studio/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, operation: action, expectedUserId: owner }),
      });
      const result = (await response.json()) as { url?: string; error?: string };

      if (!response.ok) {
        throw new Error(result.error || 'Connection failed.');
      }

      if (!active.current || deploymentConnections.get().userId !== owner) {
        throw new Error('Your account changed. Retry.');
      }

      if (action === 'oauth' && result.url) {
        popup.current!.location.href = result.url;
        setWaiting(true);
      } else {
        await refreshDeploymentConnections();
      }
    } catch (cause) {
      pending.current = null;
      popup.current?.close();
      setError(cause instanceof Error ? cause.message : 'Connection failed.');
    } finally {
      if (active.current) {
        setBusy(false);
      }
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();

    const owner = state.userId;
    setBusy(true);
    setError('');

    try {
      await connectDeploymentProvider(provider, token, baseUrl ? { baseUrl } : {});

      if (migrate) {
        const original = JSON.parse(Cookies.get('apiKeys') || '{}') as Record<string, string>;
        const providerName = Object.entries(AI_CONNECTIONS).find(([, kind]) => kind === provider)?.[0];

        if (providerName) {
          delete original[providerName];
        }

        const legacyEnvNames: Record<string, string> = {
          github: 'VITE_GITHUB_ACCESS_TOKEN',
          gitlab: 'VITE_GITLAB_ACCESS_TOKEN',
          netlify: 'VITE_NETLIFY_ACCESS_TOKEN',
          vercel: 'VITE_VERCEL_ACCESS_TOKEN',
          supabase: 'VITE_SUPABASE_ACCESS_TOKEN',
        };
        delete original[legacyEnvNames[provider]];

        if (Object.keys(original).length) {
          Cookies.set('apiKeys', JSON.stringify(original));
        } else {
          Cookies.remove('apiKeys');
        }
      }

      setToken('');
      setMigrate(false);

      if (owner === deploymentConnections.get().userId) {
        continuation.current?.();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save credentials.');
    } finally {
      setBusy(false);
    }
  };
  const importLegacy = () => {
    const providerName = Object.entries(AI_CONNECTIONS).find(([, kind]) => kind === provider)?.[0];

    if (
      !state.userId ||
      !window.confirm(
        `Move this browser's saved ${name} credentials into Rayu account ${state.userId}? Only confirm if these credentials belong to you.`,
      )
    ) {
      return;
    }

    try {
      const saved = JSON.parse(localStorage.getItem(`${provider}_connection`) || '{}') as {
        token?: string;
        user?: { token?: string };
      };
      const legacyCookie: Record<string, string> = {
        github: 'githubToken',
        gitlab: 'gitlabToken',
        netlify: 'netlifyToken',
        vercel: 'VITE_VERCEL_ACCESS_TOKEN',
        supabase: 'supabaseToken',
      };
      const value = providerName
        ? (JSON.parse(Cookies.get('apiKeys') || '{}') as Record<string, string>)[providerName]
        : saved.token ||
          saved.user?.token ||
          Cookies.get(legacyCookie[provider]) ||
          (JSON.parse(Cookies.get('apiKeys') || '{}') as Record<string, string>)[
            `VITE_${provider.toUpperCase()}_ACCESS_TOKEN`
          ];

      if (!value) {
        throw new Error('No saved browser credential found. Use Connect instead.');
      }

      setToken(value);
      setMigrate(true);
    } catch {
      setError('No valid saved browser key found.');
    }
  };
  useEffect(() => {
    setToken('');
    setMigrate(false);
    setBaseUrl('');
  }, [state.userId, provider]);

  return (
    <div className="min-w-0 space-y-3 text-sm text-rayu-elements-textPrimary">
      <h3 className="font-medium">{name}</h3>
      {state.status === 'idle' || state.status === 'loading' ? (
        <p role="status">Loading account connections…</p>
      ) : state.status === 'signed-out' ? (
        <Button onClick={() => void startRayuSignIn()}>Sign in to RayuCode</Button>
      ) : state.status === 'error' ? (
        <>
          <p role="alert">{state.error}</p>
          <Button onClick={() => void refreshDeploymentConnections()}>Retry</Button>
        </>
      ) : (
        <>
          <p className="break-words" role="status">
            {waiting
              ? 'Waiting for browser authorization…'
              : connection
                ? `${connection.status} · ${connection.maskedToken}`
                : 'Not connected'}
          </p>
          {descriptor?.enabled === false ? (
            <p>This provider is disabled by your administrator.</p>
          ) : (
            <>
              {isService && (
                <>
                  {descriptor?.ready ? (
                    <Button disabled={busy || waiting} onClick={() => void operation('oauth')}>
                      {connection ? 'Reconnect' : `Connect ${name}`}
                    </Button>
                  ) : (
                    <p>OAuth is unavailable until an administrator configures this provider.</p>
                  )}
                  <Button variant="outline" disabled={busy} onClick={importLegacy}>
                    Migrate my browser credentials
                  </Button>
                </>
              )}
              {(!isService || migrate) && (
                <form className="space-y-2" onSubmit={(event) => void save(event)}>
                  <label htmlFor={id}>
                    {provider === 'ai:amazonbedrock'
                      ? 'AWS JSON: region, accessKeyId, secretAccessKey, optional sessionToken'
                      : 'API key'}
                  </label>
                  <input
                    id={id}
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    className="w-full min-w-0 rounded border border-rayu-elements-borderColor bg-rayu-elements-background-depth-1 p-2"
                  />
                  {provider === 'ai:openai-like' && (
                    <input
                      aria-label="Approved provider HTTPS base URL"
                      type="url"
                      placeholder="Approved HTTPS base URL"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      className="w-full min-w-0 rounded border border-rayu-elements-borderColor bg-rayu-elements-background-depth-1 p-2"
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy || !token.trim()}>
                      Save to my account
                    </Button>
                    <Button type="button" variant="outline" disabled={busy} onClick={importLegacy}>
                      Migrate my browser key
                    </Button>
                  </div>
                </form>
              )}
              {connection && (
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => void operation('check')}>
                    Check connection
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void disconnectDeploymentProvider(provider).catch((cause: Error) => setError(cause.message))
                    }
                  >
                    Disconnect
                  </Button>
                  {onContinue && connection.status === 'connected' && (
                    <Button disabled={busy} onClick={onContinue}>
                      Continue
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
          {waiting && (
            <Button
              variant="outline"
              onClick={() => {
                pending.current = null;
                setWaiting(false);
                popup.current?.close();
              }}
            >
              Cancel
            </Button>
          )}
        </>
      )}
      <p className="text-xs text-rayu-elements-textSecondary">
        Credentials are encrypted in your Rayu account. Disconnecting does not delete external resources.
      </p>
      {error && (
        <p role="alert" className="break-words text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
