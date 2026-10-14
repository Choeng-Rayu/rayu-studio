import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { callStudioBackend, studioBackendSession } from '~/lib/.server/studio-backend';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);
  return session instanceof Response ? session : callStudioBackend(session, 'deploy/cloudflare/accounts');
}
