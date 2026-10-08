import { appendAuthCookies, backendApiBase, getRayuAuth, publicOrigin } from './rayu-auth';

type RuntimeEnv = Record<string, unknown>;

export async function studioBackendSession(request: Request, env?: RuntimeEnv) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });

  if (request.method !== 'GET' && request.headers.get('Origin') !== publicOrigin(request)) {
    return Response.json({ error: 'Invalid request origin' }, { status: 403, headers });
  }

  try {
    const auth = await getRayuAuth(request, env);

    if (!auth) {
      return Response.json(
        { error: 'Sign in to RayuCode to connect and deploy.', code: 'rayu_auth_required' },
        { status: 401, headers },
      );
    }

    appendAuthCookies(headers, auth.setCookies);

    return { auth, headers, base: backendApiBase(env) };
  } catch {
    return Response.json({ error: 'Rayu authentication is unavailable. Please retry.' }, { status: 503, headers });
  }
}

export async function callStudioBackend(
  session: Exclude<Awaited<ReturnType<typeof studioBackendSession>>, Response>,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  try {
    const response = await fetch(`${session.base}/studio/${path}`, {
      method: init.method || 'GET',
      headers: { Authorization: `Bearer ${session.auth.accessToken}`, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    });
    const payload = (await response.json().catch(() => null)) as { message?: unknown; error?: unknown } | null;

    if (!response.ok) {
      const message = typeof payload?.message === 'string' ? payload.message : payload?.error;

      return Response.json(
        { error: typeof message === 'string' ? message : `Deployment service request failed (${response.status}).` },
        { status: response.status, headers: session.headers },
      );
    }

    return Response.json(payload, { headers: session.headers });
  } catch {
    return Response.json(
      { error: 'Could not reach the deployment service. Please retry.' },
      { status: 502, headers: session.headers },
    );
  }
}
