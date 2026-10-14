import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { callStudioBackend, studioBackendSession } from '~/lib/.server/studio-backend';
import { CONNECTION_KINDS, SERVICE_CONNECTIONS } from '~/lib/studio-connections';
import { publicOrigin, readCookie } from '~/lib/.server/rayu-auth';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  const [connections, catalog] = await Promise.all([
    callStudioBackend(session, 'connections'),
    callStudioBackend(session, 'connections/catalog'),
  ]);

  if (!connections.ok) {
    return connections;
  }

  if (!catalog.ok) {
    return catalog;
  }

  let oauthError: { provider: string; userId: number } | undefined;

  try {
    const outcome = JSON.parse(readCookie(request, 'studio_oauth_error') ?? 'null') as {
      provider: string;
      userId: number;
    } | null;

    if (
      outcome?.userId === session.auth.user.id &&
      (SERVICE_CONNECTIONS as readonly string[]).includes(outcome.provider)
    ) {
      oauthError = outcome;
    }
  } catch {
    /* Ignore malformed, non-authoritative UI feedback. */
  }

  if (readCookie(request, 'studio_oauth_error')) {
    session.headers.append(
      'Set-Cookie',
      'studio_oauth_error=; Path=/api/studio/connections; HttpOnly; SameSite=Lax; Max-Age=0',
    );
  }

  return json(
    { userId: session.auth.user.id, connections: await connections.json(), catalog: await catalog.json(), oauthError },
    { headers: session.headers },
  );
}
export async function action({ request, context }: ActionFunctionArgs) {
  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  let input: Record<string, unknown>;

  try {
    input = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, { status: 400, headers: session.headers });
  }

  const kind = input.provider;

  if (typeof kind !== 'string' || !CONNECTION_KINDS.includes(kind)) {
    return json({ error: 'Unsupported connection.' }, { status: 400, headers: session.headers });
  }

  if (input.expectedUserId !== session.auth.user.id) {
    return json({ error: 'Your account changed. Try again.' }, { status: 409, headers: session.headers });
  }

  if (request.method === 'DELETE') {
    return callStudioBackend(session, `connections/${kind}`, { method: 'DELETE' });
  }

  if (request.method !== 'POST' && request.method !== 'PUT') {
    return json({ error: 'Method not allowed.' }, { status: 405 });
  }

  if (input.operation === 'oauth') {
    if (!(SERVICE_CONNECTIONS as readonly string[]).includes(kind)) {
      return json({ error: 'This provider uses a key.' }, { status: 400 });
    }

    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const browserBinding = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const response = await callStudioBackend(session, `connections/${kind}/oauth/start`, {
      method: 'POST',
      body: { browserBinding },
    });

    if (!response.ok) {
      return response;
    }

    const result = (await response.json()) as { url: string; state: string };
    const cookie = encodeURIComponent(
      JSON.stringify({ browserBinding, state: result.state, userId: session.auth.user.id }),
    );
    session.headers.append(
      'Set-Cookie',
      `studio_oauth_${kind}=${cookie}; Path=/api/studio/oauth/${kind}/callback; HttpOnly; SameSite=Lax; Max-Age=600${new URL(publicOrigin(request)).protocol === 'https:' ? '; Secure' : ''}`,
    );

    return json({ url: result.url }, { headers: session.headers });
  }

  if (input.operation === 'check') {
    return callStudioBackend(session, `connections/${kind}/check`, { method: 'POST' });
  }

  if (typeof input.token !== 'string' || input.token.trim().length < 8 || input.token.length > 16384) {
    return json({ error: 'Enter valid credentials.' }, { status: 400, headers: session.headers });
  }

  const saved = await callStudioBackend(session, `connections/${kind}`, {
    method: 'PUT',
    body: { token: input.token.trim(), meta: input.meta ?? {} },
  });

  if (!saved.ok) {
    return saved;
  }

  return json({ userId: session.auth.user.id, connection: await saved.json() }, { headers: session.headers });
}
