import { studioService } from '~/lib/.server/studio-service';
import { isStudioDesktop } from '~/lib/studio-connections';
import { json } from '@remix-run/cloudflare';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { withSecurity } from '~/lib/security';

async function supabaseUserLoader({ request, context }: { request: Request; context: any }) {
  const response = await studioService(request, context, 'supabase/projects');

  if (response) {
    if (!response.ok) {
      return response;
    }

    const projects = (await response.json()) as unknown[];

    return json(
      {
        user: { email: 'Connected Supabase account', role: 'Connected' },
        stats: { projects, totalProjects: projects.length },
      },
      { headers: response.headers },
    );
  }

  try {
    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get Supabase token from various sources
    const supabaseToken =
      apiKeys.VITE_SUPABASE_ACCESS_TOKEN ||
      context?.cloudflare?.env?.VITE_SUPABASE_ACCESS_TOKEN ||
      process.env.VITE_SUPABASE_ACCESS_TOKEN;

    if (!supabaseToken) {
      return json({ error: 'Supabase token not found' }, { status: 401 });
    }

    // Make server-side request to Supabase API
    const response = await fetch('https://api.supabase.com/v1/projects', {
      headers: {
        Authorization: `Bearer ${supabaseToken}`,
        'User-Agent': 'rayucode-app',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return json({ error: 'Invalid Supabase token' }, { status: 401 });
      }

      throw new Error(`Supabase API error: ${response.status}`);
    }

    const projects = (await response.json()) as Array<{
      id: string;
      name: string;
      region: string;
      status: string;
      organization_id: string;
      created_at: string;
    }>;

    // Get user info from the first project (all projects belong to the same user)
    const user =
      projects.length > 0
        ? {
            id: projects[0].organization_id,
            name: 'Supabase User', // Supabase doesn't provide user name in this endpoint
            email: 'user@supabase.co', // Placeholder
          }
        : null;

    return json({
      user,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        region: project.region,
        status: project.status,
        organization_id: project.organization_id,
        created_at: project.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching Supabase user:', error);
    return json(
      {
        error: 'Failed to fetch Supabase user information',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const loader = withSecurity(supabaseUserLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

async function supabaseUserAction({ request, context }: { request: Request; context: any }) {
  if (!isStudioDesktop()) {
    const form = await request.formData();

    if (form.get('action') === 'get_projects') {
      return supabaseUserLoader({ request, context });
    }

    if (form.get('action') === 'get_api_keys') {
      const response = await studioService(request, context, 'supabase/keys', 'POST', {
        projectId: String(form.get('projectId') ?? ''),
      });

      if (!response?.ok) {
        return response ?? new Response('Service unavailable', { status: 503 });
      }

      return json({ apiKeys: await response.json() }, { headers: response.headers });
    }

    return json({ error: 'Unsupported operation' }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const action = formData.get('action');

    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get Supabase token from various sources
    const supabaseToken =
      apiKeys.VITE_SUPABASE_ACCESS_TOKEN ||
      context?.cloudflare?.env?.VITE_SUPABASE_ACCESS_TOKEN ||
      process.env.VITE_SUPABASE_ACCESS_TOKEN;

    if (!supabaseToken) {
      return json({ error: 'Supabase token not found' }, { status: 401 });
    }

    if (action === 'get_projects') {
      // Fetch user projects
      const response = await fetch('https://api.supabase.com/v1/projects', {
        headers: {
          Authorization: `Bearer ${supabaseToken}`,
          'User-Agent': 'rayucode-app',
        },
      });

      if (!response.ok) {
        throw new Error(`Supabase API error: ${response.status}`);
      }

      const projects = (await response.json()) as Array<{
        id: string;
        name: string;
        region: string;
        status: string;
        organization_id: string;
        created_at: string;
      }>;

      // Get user info from the first project
      const user =
        projects.length > 0
          ? {
              id: projects[0].organization_id,
              name: 'Supabase User',
              email: 'user@supabase.co',
            }
          : null;

      return json({
        user,
        stats: {
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
            region: project.region,
            status: project.status,
            organization_id: project.organization_id,
            created_at: project.created_at,
          })),
          totalProjects: projects.length,
        },
      });
    }

    if (action === 'get_api_keys') {
      const projectId = formData.get('projectId');

      if (!projectId) {
        return json({ error: 'Project ID is required' }, { status: 400 });
      }

      // Fetch project API keys
      const response = await fetch(`https://api.supabase.com/v1/projects/${projectId}/api-keys`, {
        headers: {
          Authorization: `Bearer ${supabaseToken}`,
          'User-Agent': 'rayucode-app',
        },
      });

      if (!response.ok) {
        throw new Error(`Supabase API error: ${response.status}`);
      }

      const apiKeys = (await response.json()) as Array<{
        name: string;
        api_key: string;
      }>;

      return json({
        apiKeys: apiKeys.map((key) => ({
          name: key.name,
          api_key: key.api_key,
        })),
      });
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in Supabase user action:', error);
    return json(
      {
        error: 'Failed to process Supabase request',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const action = withSecurity(supabaseUserAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
