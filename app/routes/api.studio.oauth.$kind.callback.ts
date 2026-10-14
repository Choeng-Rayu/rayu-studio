import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { readCookie } from '~/lib/.server/rayu-auth';
import { callStudioBackend, studioBackendSession } from '~/lib/.server/studio-backend';
import { SERVICE_CONNECTIONS } from '~/lib/studio-connections';

/** Vercel's external installation flow finishes at its own `next` URL only. */
export function vercelCompletionUrl(raw: string | null) {
  if (!raw || raw.length > 2048) {
    return null;
  }

  try {
    const url = new URL(raw);

    if (url.origin !== 'https://vercel.com' || url.username || url.password || url.hash) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const kind = params.kind;

  if (!kind || !(SERVICE_CONNECTIONS as readonly string[]).includes(kind)) {
    return new Response('Unknown provider', { status: 404 });
  }

  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  session.headers.append(
    'Set-Cookie',
    `studio_oauth_${kind}=; Path=/api/studio/oauth/${kind}/callback; HttpOnly; SameSite=Lax; Max-Age=0`,
  );

  const url = new URL(request.url);
  let error = 'Authorization expired or the account changed. Close this window and connect again.';

  try {
    const attempt = JSON.parse(readCookie(request, `studio_oauth_${kind}`) ?? 'null') as {
      state: string;
      browserBinding: string;
      userId: number;
    } | null;

    if (attempt?.userId === session.auth.user.id && attempt.state === url.searchParams.get('state')) {
      const response = await callStudioBackend(session, `connections/${kind}/oauth/complete`, {
        method: 'POST',
        body: {
          state: attempt.state,
          browserBinding: attempt.browserBinding,
          code: url.searchParams.get('code') ?? undefined,
        },
      });
      error = response.ok
        ? ''
        : 'Authorization was cancelled, expired, or rejected. Close this window and connect again.';
    }
  } catch {
    /* Only fixed text is displayed; provider responses and codes never enter HTML. */
  }

  if (error) {
    session.headers.append(
      'Set-Cookie',
      `studio_oauth_error=${encodeURIComponent(JSON.stringify({ provider: kind, userId: session.auth.user.id }))}; Path=/api/studio/connections; HttpOnly; SameSite=Lax; Max-Age=600${url.protocol === 'https:' ? '; Secure' : ''}`,
    );
  }

  session.headers.set('Content-Type', 'text/html; charset=utf-8');
  session.headers.set('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  session.headers.set('Referrer-Policy', 'no-referrer');
  session.headers.set('Cross-Origin-Opener-Policy', 'unsafe-none');

  const completion = kind === 'vercel' && !error ? vercelCompletionUrl(url.searchParams.get('next')) : null;

  if (completion) {
    session.headers.set('Location', completion);
    return new Response(null, { status: 303, headers: session.headers });
  }

  return new Response(
    `<!doctype html><html><head><title>Studio connection</title></head><body><h1>${error ? 'Connection not completed' : 'Connected to Studio'}</h1><p>${error || 'You can close this window and return to Studio. Your pending operation will continue there.'}</p></body></html>`,
    { status: error ? 400 : 200, headers: session.headers },
  );
}
