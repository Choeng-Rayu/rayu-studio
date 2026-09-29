import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { appendAuthCookies, getRayuAuth } from '~/lib/.server/rayu-auth';

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const auth = await getRayuAuth(request, context.cloudflare?.env as unknown as Record<string, unknown>);

    if (!auth) {
      return json({ error: 'Sign in to Rayu before connecting Remote.' }, { status: 401 });
    }

    const headers = appendAuthCookies(new Headers({ 'Cache-Control': 'no-store' }), auth.setCookies);

    return json({ accessToken: auth.accessToken }, { headers });
  } catch {
    return json({ error: 'Rayu authentication is temporarily unavailable.' }, { status: 503 });
  }
}
