export interface StudioRayuUser {
  id: number;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export async function startRayuSignIn(): Promise<void> {
  const desktop = typeof window !== 'undefined' && !!window.ipc?.openExternal;
  const response = await fetch(`/api/auth/start${desktop ? '?client=desktop' : ''}`, { cache: 'no-store' });
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
