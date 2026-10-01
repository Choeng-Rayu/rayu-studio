import { afterEach, describe, expect, it, vi } from 'vitest';
import { action } from './api.vercel-deploy';

afterEach(() => vi.unstubAllGlobals());

const PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]).toString('base64');

type VercelFile = { file: string; data: string; encoding?: string };

/** Mock just enough of the Vercel API for one deployment and capture its files. */
function stubVercel() {
  const captured: { files?: VercelFile[] } = {};

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (method === 'POST' && url.endsWith('/v9/projects')) {
        return Response.json({ id: 'prj-1', name: 'rayu-studio-chat-1' });
      }

      if (method === 'POST' && url.endsWith('/v13/deployments')) {
        captured.files = JSON.parse(String(init?.body)).files;
        return Response.json({ id: 'dpl-1' });
      }

      if (method === 'GET' && url.endsWith('/v13/deployments/dpl-1')) {
        return Response.json({ readyState: 'READY', url: 'rayu-studio-chat-1.vercel.app' });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    }),
  );

  return captured;
}

function deployRequest(body: unknown) {
  return new Request('http://studio.example.com/api/vercel-deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Vercel deploy', () => {
  it('sends binary build output with base64 encoding (static site)', async () => {
    const captured = stubVercel();

    const response = await action({
      request: deployRequest({
        token: 'vercel-token',
        chatId: 'chat-1',
        files: { '/index.html': '<p>hi</p>' },
        binaryFiles: { '/logo.png': PNG_BASE64 },
      }),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(200);
    expect(captured.files).toEqual([
      { file: 'index.html', data: '<p>hi</p>' },
      { file: 'logo.png', data: PNG_BASE64, encoding: 'base64' },
    ]);
  });

  it('sends binary source assets with base64 encoding when Vercel builds the project', async () => {
    const captured = stubVercel();
    const packageJson = JSON.stringify({ dependencies: { react: '18.3.1' }, devDependencies: { vite: '5.4.0' } });

    const response = await action({
      request: deployRequest({
        token: 'vercel-token',
        chatId: 'chat-1',
        files: { '/index.html': '<p>built</p>' },
        sourceFiles: { 'package.json': packageJson, 'src/main.tsx': 'export {}' },
        binarySourceFiles: { 'public/hero.png': PNG_BASE64 },
      }),
      context: {},
      params: {},
    } as any);

    expect(response.status).toBe(200);
    expect(captured.files).toEqual([
      { file: 'package.json', data: packageJson },
      { file: 'src/main.tsx', data: 'export {}' },
      { file: 'public/hero.png', data: PNG_BASE64, encoding: 'base64' },
    ]);
  });
});
