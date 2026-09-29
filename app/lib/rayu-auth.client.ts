export interface StudioRayuUser {
  id: number;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export async function startRayuSignIn(): Promise<void> {
  const desktop = typeof window !== 'undefined' && !!window.ipc?.openExternal;
  const params = new URLSearchParams();

  if (desktop) {
    params.set('client', 'desktop');
  }

  if (window.location.pathname === '/remote') {
    const pair = new URLSearchParams(window.location.search).get('pair');

    if (pair && /^[A-Za-z0-9_-]{20,80}$/.test(pair)) {
      params.set('pair', pair);
    }
  }

  const response = await fetch(`/api/auth/start?${params}`, { cache: 'no-store' });
  const result = (await response.json()) as { url?: string; error?: string };

  if (!response.ok || !result.url) {
    throw new Error(result.error || 'Could not start Rayu sign-in.');
  }

  if (desktop) {
    await window.ipc!.openExternal(result.url);
    return;
  }

  window.location.assign(result.url);
}

export async function loadRayuUser(): Promise<StudioRayuUser | null> {
  const response = await fetch('/api/auth/session', { cache: 'no-store' });

  if (!response.ok) {
    return null;
  }

  const result = (await response.json()) as { user?: StudioRayuUser | null };

  return result.user ?? null;
}
