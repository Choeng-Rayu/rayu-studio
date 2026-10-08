import { useEffect, useState } from 'react';
import { loadRayuUser, type StudioRayuUser, startRayuSignIn } from '~/lib/rayu-auth.client';
import { clearDeploymentConnections } from '~/lib/stores/deploymentConnections';

export function StudioAuthControl() {
  const [user, setUser] = useState<StudioRayuUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const next = await loadRayuUser().catch(() => null);

      if (active) {
        setUser(next);
        setLoading(false);
      }
    };
    void refresh();
    window.addEventListener('rayu-auth-change', refresh);

    return () => {
      active = false;
      window.removeEventListener('rayu-auth-change', refresh);
    };
  }, []);

  const signIn = async () => {
    setError('');

    try {
      await startRayuSignIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const signOut = async () => {
    setLoading(true);
    clearDeploymentConnections();
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    setLoading(false);
    window.dispatchEvent(new Event('rayu-auth-change'));
  };

  if (loading) {
    return <span className="text-xs text-rayu-elements-textSecondary">Rayu…</span>;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        {error && (
          <span role="status" className="max-w-40 truncate text-xs text-red-400">
            {error}
          </span>
        )}
        <button
          className="rounded-md border border-rayu-elements-borderColor px-3 py-1.5 text-xs text-rayu-elements-textPrimary hover:bg-rayu-elements-background-depth-2"
          onClick={() => void signIn()}
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="max-w-40 truncate text-xs text-rayu-elements-textSecondary"
        title={user.email || user.displayName || ''}
      >
        {user.displayName || user.email || 'Rayu account'}
      </span>
      <button
        className="rounded-md border border-rayu-elements-borderColor px-3 py-1.5 text-xs text-rayu-elements-textPrimary hover:bg-rayu-elements-background-depth-2"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
    </div>
  );
}
