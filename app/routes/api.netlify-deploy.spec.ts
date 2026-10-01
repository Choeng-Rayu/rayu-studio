import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { action } from './api.netlify-deploy';

afterEach(() => vi.unstubAllGlobals());

// A PNG signature plus bytes that are invalid as UTF-8 (0x89, 0xff) and a NUL.
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00, 0x10]);
const HTML = '<p>© Rayu</p>';
const sha1 = (data: string | Uint8Array) => crypto.createHash('sha1').update(data).digest('hex');

function deployRequest(body: unknown) {
  return new Request('http://studio.example.com/api/netlify-deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Netlify deploy', () => {
  it('uploads binary build files as their original bytes, with digests over those bytes', async () => {
    const uploaded = new Map<string, Uint8Array>();
    let deployFiles: Record<string, string> | undefined;
    let polls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (method === 'POST' && url.endsWith('/api/v1/sites')) {
          return Response.json({ id: 'site-1', name: 'site', url: 'https://site.netlify.app' });
        }

        if (method === 'POST' && url.endsWith('/sites/site-1/deploys')) {
          deployFiles = JSON.parse(String(init?.body)).files;
          return Response.json({ id: 'deploy-1', state: 'new' });
        }

        if (method === 'GET' && url.endsWith('/sites/site-1/deploys/deploy-1')) {
          polls++;
          return Response.json({ id: 'deploy-1', state: polls === 1 ? 'prepared' : 'ready', ssl_url: 'https://x' });
        }

        if (method === 'PUT' && url.includes('/deploys/deploy-1/files/')) {
          const body = init?.body;
          const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body as Uint8Array);
          uploaded.set(decodeURIComponent(url.split('/files')[1]), bytes);

          return new Response(null, { status: 200 });
        }

        throw new Error(`Unexpected request: ${method} ${url}`);
      }),
    );

    const response = await action({
      request: deployRequest({
        token: 'netlify-token',
        chatId: 'chat-1',
        files: { '/index.html': HTML },
        binaryFiles: { '/assets/logo.png': Buffer.from(PNG).toString('base64') },
      }),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(200);
    expect(deployFiles).toEqual({ '/index.html': sha1(HTML), '/assets/logo.png': sha1(PNG) });
    expect(uploaded.get('/assets/logo.png')).toEqual(PNG);
    expect(new TextDecoder().decode(uploaded.get('/index.html'))).toBe(HTML);
  });

  it('rejects malformed base64 before creating anything on Netlify', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await action({
      request: deployRequest({ token: 't', chatId: 'c', files: {}, binaryFiles: { '/a.png': '%%% not base64 %%%' } }),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
