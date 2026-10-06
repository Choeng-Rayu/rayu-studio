import { afterEach, describe, expect, it, vi } from 'vitest';
import { action, loader } from './api.git-proxy.$';

afterEach(() => vi.unstubAllGlobals());

const INFO_REFS = 'info/refs';
const UPLOAD_PACK_QUERY = '?service=git-upload-pack';

/** A request to /api/git-proxy/<path><query>, routed like Remix (splat excludes the query). */
const proxied = (path: string, query = '', init: RequestInit = {}) => {
  const args = {
    request: new Request(`http://studio.example.com/api/git-proxy/${path}${query}`, init),
    params: { '*': path },
    context: {},
  } as any;

  return (init.method ?? 'GET') === 'GET' ? loader(args) : action(args);
};

describe('git CORS proxy', () => {
  it.each([
    ['cloud metadata', `169.254.169.254/latest/meta-data/${INFO_REFS}`],
    ['a container on the Docker network', `coolify-db:5432/repo.git/${INFO_REFS}`],
    ['the Docker host', `host.docker.internal:2375/repo.git/${INFO_REFS}`],
    ['loopback via userinfo trick', `github.com@127.0.0.1/repo.git/${INFO_REFS}`],
  ])('refuses %s without contacting it', async (_label, path) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await proxied(path, UPLOAD_PACK_QUERY);

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['an ordinary web page', 'example.com/some/page', '', 'GET'],
    ['ref discovery without a git service', `github.com/rayucode/rayu-studio.git/${INFO_REFS}`, '', 'GET'],
    ['an unknown git service', `github.com/rayucode/rayu-studio.git/${INFO_REFS}`, '?service=evil', 'GET'],
    ['a PUT to a git endpoint', 'github.com/rayucode/rayu-studio.git/git-upload-pack', '', 'PUT'],
  ])('refuses %s, even on a public host', async (_label, path, query, method) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await proxied(path, query, method === 'GET' ? {} : { method, body: 'x' });

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still proxies ref discovery on public git hosts, keeping CORS headers', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('001e# service=git-upload-pack\n', {
        status: 200,
        headers: { 'content-type': 'application/x-git-upload-pack-advertisement' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const response = await proxied(`github.com/rayucode/rayu-studio.git/${INFO_REFS}`, UPLOAD_PACK_QUERY);

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://github.com/choeng-rayu/rayu-studio.git/info/refs?service=git-upload-pack',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('still proxies the pack exchange (POST git-upload-pack)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('0008NAK\n', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await proxied('github.com/rayucode/rayu-studio.git/git-upload-pack', '', {
      method: 'POST',
      headers: { 'content-type': 'application/x-git-upload-pack-request' },
      body: '0032want 0123456789012345678901234567890123456789\n00000009done\n',
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://github.com/choeng-rayu/rayu-studio.git/git-upload-pack',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not follow a public redirect into the private network', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'http://10.0.0.7/admin' } }));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await proxied(`evil.example.com/repo.git/${INFO_REFS}`, UPLOAD_PACK_QUERY);

    expect(response.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
