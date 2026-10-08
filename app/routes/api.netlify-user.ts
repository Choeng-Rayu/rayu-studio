import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { callStudioBackend, studioBackendSession } from '~/lib/.server/studio-backend';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  return callStudioBackend(session, 'deploy/netlify/user');
}

export async function action({ request, context }: ActionFunctionArgs) {
  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  const form = await request.formData();

  if (form.get('action') !== 'get_sites') {
    return Response.json({ error: 'Invalid action' }, { status: 400, headers: session.headers });
  }

  return callStudioBackend(session, 'deploy/netlify/sites');
}
