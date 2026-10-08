import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { callStudioBackend, studioBackendSession } from '~/lib/.server/studio-backend';

const PROVIDERS = {
  netlify: 'https://api.netlify.com/api/v1/user',
  vercel: 'https://api.vercel.com/v2/user',
} as const;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  const response = await callStudioBackend(session, 'connections');

  if (!response.ok) {
    return response;
  }

  const connections = (await response.json()) as Array<{ kind: string; maskedToken: string; meta: unknown }>;

  return json(
    {
      userId: session.auth.user.id,
      connections: connections.filter((connection) => connection.kind === 'netlify' || connection.kind === 'vercel'),
    },
    { headers: session.headers },
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  const { headers } = session;

  let input: { provider?: string; token?: string };

  try {
    input = (await request.json()) as { provider?: string; token?: string };
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400, headers });
  }

  if (!input || (input.provider !== 'netlify' && input.provider !== 'vercel')) {
    return json({ error: 'Unsupported deploy provider' }, { status: 400, headers });
  }

  if (request.method === 'DELETE') {
    return callStudioBackend(session, `connections/${input.provider}`, { method: 'DELETE' });
  }

  const token = typeof input.token === 'string' ? input.token.trim() : '';

  if (token.length < 8 || token.length > 4096) {
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
        { status: 400, headers },
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

    const profile = user as Record<string, unknown>;
    const meta = Object.fromEntries(
      ['id', 'email', 'name', 'username', 'full_name', 'avatar_url']
        .map((key) => [key, profile[key]])
        .filter(([, value]) => typeof value === 'string'),
    );
    const saved = await callStudioBackend(session, `connections/${input.provider}`, {
      method: 'PUT',
      body: { token, meta },
    });

    if (!saved.ok) {
      return saved;
    }

    return json({ userId: session.auth.user.id, connection: await saved.json() }, { headers });
  } catch {
    return json({ error: 'Could not reach the provider. Check your network and retry.' }, { status: 502, headers });
  }
}
