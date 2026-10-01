import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import {
  authBridgeUrl,
  clearLoginPairCookie,
  loginPairCookie,
  loginStateCookie,
  publicOrigin,
} from '~/lib/.server/rayu-auth';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const desktop = url.searchParams.get('client') === 'desktop';
  const requestedPair = url.searchParams.get('pair') || '';
  const pair = /^[A-Za-z0-9_-]{20,80}$/.test(requestedPair) ? requestedPair : '';
  const stateBytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(stateBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const redirectUri = desktop ? 'rayustudio://auth' : `${publicOrigin(request)}/auth/callback`;
  const bridge = new URL(authBridgeUrl(context.cloudflare?.env as unknown as Record<string, unknown>));
  bridge.searchParams.set('state', state);
  bridge.searchParams.set('redirect_uri', redirectUri);

  const headers = new Headers({ 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', loginStateCookie(request, state));
  headers.append('Set-Cookie', pair ? loginPairCookie(request, pair) : clearLoginPairCookie(request));

  return json({ url: bridge.toString() }, { headers });
}
