import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { authBridgeUrl, loginStateCookie } from '~/lib/.server/rayu-auth';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const desktop = url.searchParams.get('client') === 'desktop';
  const stateBytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(stateBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const redirectUri = desktop ? 'rayustudio://auth' : `${url.origin}/auth/callback`;
  const bridge = new URL(authBridgeUrl(context.cloudflare?.env as unknown as Record<string, unknown>));
  bridge.searchParams.set('state', state);
  bridge.searchParams.set('redirect_uri', redirectUri);

  return json(
    { url: bridge.toString() },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': loginStateCookie(request, state),
      },
    },
  );
}
