import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { callStudioBackend, studioBackendSession } from './studio-backend';

type Provider = 'netlify' | 'vercel';

function relativeFiles(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid deployment file map.');
  }

  return Object.fromEntries(
    Object.entries(value).map(([path, content]) => [path.replace(/^\/+/, ''), content]),
  ) as Record<string, string>;
}

export async function deployAction(provider: Provider, { request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  let body;

  try {
    const input = (await request.json()) as Record<string, unknown>;

    if (!input || typeof input !== 'object' || input.token !== undefined || input.userId !== undefined) {
      throw new Error('Deployment uses the provider connection saved to your Rayu account.');
    }

    if (input.expectedUserId !== session.auth.user.id) {
      return Response.json(
        { error: 'Your Rayu account changed. Please start this deployment again.' },
        { status: 409, headers: session.headers },
      );
    }

    body = {
      files: relativeFiles(input.files) ?? {},
      binaryFiles: relativeFiles(input.binaryFiles),
      chatId: input.chatId,
      ...(provider === 'netlify'
        ? { siteId: input.siteId }
        : {
            projectId: input.projectId,
            sourceFiles: relativeFiles(input.sourceFiles),
            binarySourceFiles: relativeFiles(input.binarySourceFiles),
          }),
    };
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid deployment request.' },
      { status: 400, headers: session.headers },
    );
  }

  return callStudioBackend(session, `deploy/${provider}`, { method: 'POST', body });
}

export async function deployStatus(provider: Provider, { request, context }: LoaderFunctionArgs) {
  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  const id = new URL(request.url).searchParams.get('id');

  if (!id || id.length > 128) {
    return Response.json({ error: 'Invalid deployment ID.' }, { status: 400, headers: session.headers });
  }

  return callStudioBackend(session, `deploy/status?${new URLSearchParams({ id, provider })}`);
}
