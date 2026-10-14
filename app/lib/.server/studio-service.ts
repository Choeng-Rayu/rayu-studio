import { isStudioDesktop } from '~/lib/studio-connections';
import { callStudioBackend, studioBackendSession } from './studio-backend';

export async function studioService(
  request: Request,
  context: { cloudflare?: { env?: unknown } },
  path: string,
  method = 'GET',
  body?: unknown,
) {
  if (isStudioDesktop()) {
    return null;
  }

  const session = await studioBackendSession(request, context.cloudflare?.env as Record<string, unknown>);

  return session instanceof Response ? session : callStudioBackend(session, path, { method, body });
}
