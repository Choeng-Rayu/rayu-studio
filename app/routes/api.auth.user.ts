import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { appendAuthCookies, getRayuAuth } from '~/lib/.server/rayu-auth';

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const auth = await getRayuAuth(request, context.cloudflare?.env as unknown as Record<string, unknown>);

    if (!auth) {
      return json({ error: 'Please sign in to your Rayu account.' }, { status: 401 });
    }

    const headers = appendAuthCookies(new Headers({ 'Cache-Control': 'no-store' }), auth.setCookies);

    return json({ user: auth.user }, { headers });
  } catch {
    return json({ error: 'Rayu authentication is temporarily unavailable.' }, { status: 503 });
  }
}
