import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';
import { MCPService, type MCPConfig } from '~/lib/services/mcpService';
import { appendAuthCookies, getRayuAuth } from '~/lib/.server/rayu-auth';

const logger = createScopedLogger('api.mcp-update-config');

/*
 * Signed-in only, and scoped to that user's MCP service. This route connects the
 * server to the given MCP servers (stdio servers are local processes under Node), so
 * it must never be callable anonymously or cross-site: the Rayu session cookies are
 * SameSite=Lax, so a forged cross-site POST arrives without them and gets a 401.
 */
export async function action({ request, context }: ActionFunctionArgs) {
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
    const mcpConfig = (await request.json()) as MCPConfig;

    if (!mcpConfig || typeof mcpConfig !== 'object') {
      return Response.json({ error: 'Invalid MCP servers configuration' }, { status: 400, headers });
    }

    const serverTools = await MCPService.forUser(auth.user.id).updateConfig(mcpConfig);

    return Response.json(serverTools, { headers });
  } catch (error) {
    logger.error('Error updating MCP config:', error);
    return Response.json({ error: 'Failed to update MCP config' }, { status: 500, headers });
  }
}
