import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from './api.github-template';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const templateRequest = () => new Request('http://studio.example.com/api/github-template?repo=owner/template');

describe('starter template import', () => {
  it('uses the 2-request zipball path in the Docker image even though wrangler sets CF_PAGES', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const zip = new JSZip();
    zip.file('owner-template-abc123/package.json', '{"name":"starter"}');
    zip.file('owner-template-abc123/index.html', '<p>© Rayu</p>');

    const zipBytes = await zip.generateAsync({ type: 'arraybuffer' });
    const fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      // Like GitHub: no User-Agent, no API access (workerd's fetch does not add one).
      if (!new Headers(init?.headers).get('User-Agent')) {
        return new Response('Request forbidden: missing User-Agent', { status: 403 });
      }

      if (url.endsWith('/repos/owner/template/releases/latest')) {
        return Response.json({ zipball_url: 'https://api.github.com/repos/owner/template/zipball/template' });
      }

      if (url.endsWith('/zipball/template')) {
        return new Response(zipBytes);
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const response = await loader({
      request: templateRequest(),
      context: { cloudflare: { env: { CF_PAGES: '1', RUNNING_IN_DOCKER: 'true' } } },
    });
    const files = (await response.json()) as Array<{ path: string; content: string }>;

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(files.map((file) => file.path).sort()).toEqual(['index.html', 'package.json']);
    expect(files.find((file) => file.path === 'index.html')?.content).toBe('<p>© Rayu</p>');
  });

  it('fails instead of returning a partial template when a file download fails', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/repos/owner/template')) {
        return Response.json({ default_branch: 'main' });
      }

      if (url.includes('/git/trees/main')) {
        return Response.json({
          tree: [
            { type: 'blob', path: 'index.html', size: 10 },
            { type: 'blob', path: 'package.json', size: 10 },
          ],
        });
      }

      if (url.endsWith('/contents/index.html')) {
        return Response.json({ content: btoa('<p>hi</p>') });
      }

      if (url.endsWith('/contents/package.json')) {
        return new Response('API rate limit exceeded', { status: 403 });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Real Cloudflare Pages (no RUNNING_IN_DOCKER) keeps the per-file Contents API path.
    const response = await loader({
      request: templateRequest(),
      context: { cloudflare: { env: { CF_PAGES: '1' } } },
    });
    const payload = (await response.json()) as { error: string; details: string };

    expect(response.status).toBe(500);
    expect(payload.details).toContain('package.json');
    expect(payload.details).toContain('GITHUB_TOKEN');
  });
});
