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
    setError('');
    setLoading(true);
    window.dispatchEvent(new Event('rayu-auth-signout'));
    clearDeploymentConnections();

    try {
      const response = await fetch('/api/auth/signout', { method: 'POST' });

      if (!response.ok) {
        throw new Error('Could not sign out. Please try again. Remote control has been stopped.');
      }

      setUser(null);
      window.dispatchEvent(new Event('rayu-auth-change'));
    } catch {
      setError('Could not sign out. Please try again. Remote control has been stopped.');
    } finally {
      setLoading(false);
    }
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
      {error && (
        <span role="alert" className="max-w-40 text-xs text-red-400">
          {error}
        </span>
      )}
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
