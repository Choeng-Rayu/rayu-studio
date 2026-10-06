import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { appendAuthCookies, getRayuAuth, publicOrigin } from '~/lib/.server/rayu-auth';

const PROVIDERS = {
  netlify: 'https://api.netlify.com/api/v1/user',
  vercel: 'https://api.vercel.com/v2/user',
} as const;

export async function action({ request, context }: ActionFunctionArgs) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405, headers });
  }

  if (request.headers.get('Origin') !== publicOrigin(request)) {
    return json({ error: 'Invalid request origin' }, { status: 403, headers });
  }

  let auth;

  try {
    auth = await getRayuAuth(request, context.cloudflare?.env as unknown as Record<string, unknown>);
  } catch {
    return json({ error: 'Rayu authentication is unavailable. Please retry.' }, { status: 503, headers });
  }

  if (!auth) {
    return json({ error: 'Sign in to RayuCode before connecting a deploy provider.' }, { status: 401, headers });
  }

  appendAuthCookies(headers, auth.setCookies);

  let input: { provider?: string; token?: string };

  try {
    input = (await request.json()) as { provider?: string; token?: string };
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400, headers });
  }

  if (input.provider !== 'netlify' && input.provider !== 'vercel') {
    return json({ error: 'Unsupported deploy provider' }, { status: 400, headers });
  }

  const token = input.token?.trim();

  if (!token || token.length > 4096) {
    return json({ error: 'Enter a valid personal access token.' }, { status: 400, headers });
  }

  try {
    const response = await fetch(PROVIDERS[input.provider], {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 401 || response.status === 403) {
      return json(
        {
          error: `${input.provider === 'netlify' ? 'Netlify' : 'Vercel'} rejected this token. Check that it is active and has access to your account.`,
        },
        { status: response.status, headers },
      );
    }

    if (!response.ok) {
      return json({ error: `Provider request failed (${response.status}). Please retry.` }, { status: 502, headers });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const user = input.provider === 'vercel' ? payload.user : payload;

    if (!user || typeof user !== 'object' || !('id' in user)) {
      return json({ error: 'Provider returned an unexpected account response.' }, { status: 502, headers });
    }

    return json({ user }, { headers });
  } catch {
    return json({ error: 'Could not reach the provider. Check your network and retry.' }, { status: 502, headers });
  }
}
