import { studioService } from '~/lib/.server/studio-service';
import { isStudioDesktop } from '~/lib/studio-connections';
import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isStudioDesktop()) {
    const body = (await request.json()) as { projectId: string };
    const response = await studioService(request, context, 'supabase/keys', 'POST', { projectId: body.projectId });

    if (!response?.ok) {
      return response ?? new Response('Service unavailable', { status: 503 });
    }

    return json({ apiKeys: await response.json() }, { headers: response.headers });
  }

  try {
    // Add proper type assertion for the request body
    const body = (await request.json()) as { projectId?: string; token?: string };
    const { projectId, token } = body;

    if (!projectId || !token) {
      return json({ error: 'Project ID and token are required' }, { status: 400 });
    }

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectId}/api-keys`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return json({ error: `Failed to fetch API keys: ${response.statusText}` }, { status: response.status });
    }

    const apiKeys = await response.json();

    return json({ apiKeys });
  } catch (error) {
    console.error('Error fetching project API keys:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error occurred' }, { status: 500 });
  }
}
