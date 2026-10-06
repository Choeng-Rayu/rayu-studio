export async function verifyDeployProviderToken(provider: 'netlify' | 'vercel', token: string): Promise<unknown> {
  const response = await fetch('/api/deploy-provider-connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, token: token.trim() }),
  });
  const result = (await response.json()) as { user?: unknown; error?: string };

  if (!response.ok || !result.user) {
    throw new Error(result.error || `Could not connect to ${provider} (${response.status})`);
  }

  return result.user;
}
