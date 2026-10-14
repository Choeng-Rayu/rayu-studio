import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { callStudioBackend, studioBackendSession } from '~/lib/.server/studio-backend';

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  if (!['github', 'gitlab'].includes(params.provider ?? '')) {
    return new Response('Unknown provider', { status: 404 });
  }

  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  const operation = new URL(request.url).searchParams.get('operation');

  if (!['user', 'repos', 'projects'].includes(operation ?? '')) {
    return new Response('Unknown operation', { status: 400 });
  }

  return callStudioBackend(session, `scm/${params.provider}/${operation}`);
}
export async function action({ request, context, params }: ActionFunctionArgs) {
  if (request.method !== 'POST' || !['github', 'gitlab'].includes(params.provider ?? '')) {
    return new Response('Invalid operation', { status: 400 });
  }

  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  const input = (await request.json()) as {
    expectedUserId: number;
    repo: string;
    files: Record<string, string>;
    branch?: string;
    private?: boolean;
    commitMessage?: string;
  };

  if (input.expectedUserId !== session.auth.user.id) {
    return Response.json({ error: 'Your account changed. Retry.' }, { status: 409 });
  }

  return callStudioBackend(session, `scm/${params.provider}/push`, {
    method: 'POST',
    body: {
      repo: input.repo,
      files: input.files,
      branch: input.branch,
      private: input.private,
      commitMessage: input.commitMessage,
    },
  });
}
