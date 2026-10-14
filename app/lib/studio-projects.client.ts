import { readDeploymentResponse } from './deployment.client';
import { deploymentConnections } from './stores/deploymentConnections';

const pending = new Map<string, Promise<string>>();
const verified = new Map<string, number>();

function projectKey(userId: number, chatId: string) {
  return `studio-project:${userId}:${chatId}`;
}

export async function ensureStudioProject(
  userId: number,
  chatId: string,
  name = 'Studio project',
  provider?: string,
  model?: string,
): Promise<string> {
  if (deploymentConnections.get().userId !== userId) {
    throw new Error('Your account changed. Retry.');
  }

  const key = projectKey(userId, chatId);
  const saved = localStorage.getItem(key);

  if (saved && Date.now() - (verified.get(key) ?? 0) < 60_000) {
    return saved;
  }

  const existing = pending.get(key);

  if (existing) {
    return existing;
  }

  const promise = (async () => {
    if (saved && /^[a-f0-9-]{36}$/i.test(saved)) {
      const response = await fetch(
        `/api/studio/projects?${new URLSearchParams({ projectId: saved, metadata: 'true' })}`,
        { cache: 'no-store' },
      );

      if (deploymentConnections.get().userId !== userId) {
        throw new Error('Your account changed. Retry.');
      }

      if (response.ok) {
        verified.set(key, Date.now());
        return saved;
      }

      if (response.status !== 404) {
        await readDeploymentResponse(response);
      }

      localStorage.removeItem(key);
    }

    const project = await readDeploymentResponse<{ id: string }>(
      await fetch('/api/studio/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedUserId: userId, name: name.slice(0, 120), provider, model }),
      }),
    );

    if (deploymentConnections.get().userId !== userId) {
      throw new Error('Your account changed. Retry.');
    }

    localStorage.setItem(key, project.id);
    verified.set(key, Date.now());

    return project.id;
  })();
  pending.set(key, promise);

  try {
    return await promise;
  } finally {
    pending.delete(key);
  }
}
export function existingStudioProject(userId: number, chatId: string) {
  return localStorage.getItem(projectKey(userId, chatId));
}
export async function updateStudioProject(
  userId: number,
  chatId: string,
  updates: {
    name?: string;
    provider?: string;
    model?: string;
    bindings?: Record<string, string>;
    preferences?: Record<string, unknown>;
  },
) {
  const id = await ensureStudioProject(userId, chatId);
  const project = await readDeploymentResponse<{ name: string; bindings?: Record<string, string> }>(
    await fetch(`/api/studio/projects?${new URLSearchParams({ projectId: id, metadata: 'true' })}`),
  );

  if (userId !== deploymentConnections.get().userId) {
    throw new Error('Your account changed. Retry.');
  }

  return readDeploymentResponse(
    await fetch('/api/studio/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUserId: userId,
        id,
        name: project.name,
        ...updates,
      }),
    }),
  );
}

/** Keep a failed/uncertain operation ID for a safe network retry. Success clears it. */
export function deploymentOperation(userId: number, projectId: string, provider: string) {
  const key = `studio-operation:${userId}:${projectId}:${provider}`;
  const value = sessionStorage.getItem(key) || crypto.randomUUID();
  sessionStorage.setItem(key, value);

  return { id: value, completed: () => sessionStorage.removeItem(key) };
}
