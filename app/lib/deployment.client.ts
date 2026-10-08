import { atom } from 'nanostores';
import type { DeploymentProvider } from '~/lib/stores/deploymentConnections';

export interface DeploymentResult {
  deployId: string;
  siteId?: string;
  projectId?: string;
  url: string | null;
}

export const deploymentRevision = atom(0);

function deploymentKey(userId: number, provider: DeploymentProvider, chatId: string) {
  return `rayu-deployment:${userId}:${provider}:${chatId}`;
}

export function getSavedDeployment(
  userId: number,
  provider: DeploymentProvider,
  chatId: string,
): DeploymentResult | null {
  try {
    const value = localStorage.getItem(deploymentKey(userId, provider, chatId));
    return value ? (JSON.parse(value) as DeploymentResult) : null;
  } catch {
    return null;
  }
}

export function saveDeployment(userId: number, provider: DeploymentProvider, chatId: string, result: DeploymentResult) {
  try {
    localStorage.setItem(deploymentKey(userId, provider, chatId), JSON.stringify(result));
  } catch {
    // A successful deploy does not depend on browser storage being available.
  }

  deploymentRevision.set(deploymentRevision.get() + 1);
}

export async function readDeploymentResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || `Deployment request failed (${response.status}).`);
  }

  return data;
}

export async function waitForDeployment(
  provider: DeploymentProvider,
  result: DeploymentResult,
): Promise<DeploymentResult> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const status = await readDeploymentResponse<{
      state?: string;
      readyState?: string;
      ssl_url?: string;
      url?: string;
      error_message?: string;
    }>(await fetch(`/api/${provider}-deploy?${new URLSearchParams({ id: result.deployId })}`, { cache: 'no-store' }));
    const state = (status.readyState || status.state || '').toLowerCase();

    if (state === 'ready') {
      const url = status.ssl_url || status.url || result.url;
      return { ...result, url: url && !url.startsWith('https://') ? `https://${url}` : url || null };
    }

    if (state === 'error' || state === 'canceled' || state === 'cancelled') {
      throw new Error(status.error_message || `${provider === 'netlify' ? 'Netlify' : 'Vercel'} deployment ${state}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('Deployment is still processing. Check your provider dashboard for its status.');
}
