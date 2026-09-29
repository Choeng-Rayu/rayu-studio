import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { appendAuthCookies, getRayuAuth } from '~/lib/.server/rayu-auth';

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const auth = await getRayuAuth(request, context.cloudflare?.env as unknown as Record<string, unknown>);
    const headers = appendAuthCookies(new Headers({ 'Cache-Control': 'no-store' }), auth?.setCookies ?? []);

    return json({ user: auth?.user ?? null }, { headers });
  } catch (error) {
    return json(
      { user: null, error: error instanceof Error ? error.message : 'Authentication unavailable' },
      { status: 503 },
    );
  }
}
