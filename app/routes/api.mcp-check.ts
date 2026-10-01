import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';
import { MCPService } from '~/lib/services/mcpService';
import { appendAuthCookies, getRayuAuth } from '~/lib/.server/rayu-auth';

const logger = createScopedLogger('api.mcp-check');

// Reports only the signed-in user's own MCP servers (see api.mcp-update-config).
export async function loader({ request, context }: LoaderFunctionArgs) {
  let auth;

  try {
    auth = await getRayuAuth(request, context.cloudflare?.env as unknown as Record<string, unknown>);
  } catch {
    return Response.json({ error: 'Rayu authentication is temporarily unavailable.' }, { status: 503 });
  }

  if (!auth) {
    return Response.json({ error: 'Sign in to Rayu to connect MCP servers.' }, { status: 401 });
  }

  const headers = appendAuthCookies(new Headers(), auth.setCookies);

  try {
    const serverTools = await MCPService.forUser(auth.user.id).checkServersAvailabilities();

    return Response.json(serverTools, { headers });
  } catch (error) {
    logger.error('Error checking MCP servers:', error);
    return Response.json({ error: 'Failed to check MCP servers' }, { status: 500, headers });
  }
}
