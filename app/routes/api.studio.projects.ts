import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { callStudioBackend, studioBackendSession } from '~/lib/.server/studio-backend';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  if (projectId && !/^[a-f0-9-]{36}$/i.test(projectId)) {
    return Response.json({ error: 'Invalid project ID' }, { status: 400 });
  }

  return callStudioBackend(
    session,
    projectId
      ? url.searchParams.get('metadata') === 'true'
        ? `projects/${projectId}`
        : `deployments?${new URLSearchParams({ projectId })}`
      : 'projects',
  );
}
export async function action({ request, context }: ActionFunctionArgs) {
  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  if (request.method !== 'POST' && request.method !== 'PATCH') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const input = (await request.json()) as {
    expectedUserId: number;
    id?: string;
    name: string;
    provider?: string;
    model?: string;
    bindings?: Record<string, string>;
    preferences?: Record<string, unknown>;
  };

  if (input.expectedUserId !== session.auth.user.id) {
    return Response.json({ error: 'Account changed. Retry.' }, { status: 409, headers: session.headers });
  }

  if (request.method === 'PATCH' && (!input.id || !/^[a-f0-9-]{36}$/i.test(input.id))) {
    return Response.json({ error: 'Invalid project ID' }, { status: 400 });
  }

  return callStudioBackend(session, request.method === 'PATCH' ? `projects/${input.id}` : 'projects', {
    method: request.method,
    body: {
      name: input.name,
      provider: input.provider,
      model: input.model,
      bindings: input.bindings,
      preferences: input.preferences,
    },
  });
}
