import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { deployAction, deployStatus } from '~/lib/.server/studio-deploy';

export const action = (args: ActionFunctionArgs) => deployAction('vercel', args);
export const loader = (args: LoaderFunctionArgs) => deployStatus('vercel', args);
