import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { appendAuthCookies, clearAuthCookies } from '~/lib/.server/rayu-auth';

export async function action({ request }: ActionFunctionArgs) {
  const headers = appendAuthCookies(new Headers({ 'Cache-Control': 'no-store' }), clearAuthCookies(request));
  return json({ ok: true }, { headers });
}
