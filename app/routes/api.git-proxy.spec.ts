import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from './api.git-proxy.$';

afterEach(() => vi.unstubAllGlobals());

const proxied = (path: string) =>
  loader({
    request: new Request(`http://studio.example.com/api/git-proxy/${path}`),
    params: { '*': path },
    context: {},
  } as any);

describe('git CORS proxy', () => {
  it.each([
    ['cloud metadata', '169.254.169.254/latest/meta-data/'],
    ['a container on the Docker network', 'coolify-db:5432/'],
    ['the Docker host', 'host.docker.internal:2375/version'],
    ['loopback via userinfo trick', 'github.com@127.0.0.1/repo.git/info/refs'],
  ])('refuses %s without contacting it', async (_label, path) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await proxied(path);

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still proxies public git hosts, keeping CORS headers', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('001e# service=git-upload-pack\n', {
        status: 200,
        headers: { 'content-type': 'application/x-git-upload-pack-advertisement' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const response = await proxied('github.com/rayucode/rayu-studio.git/info/refs');

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://github.com/rayucode/rayu-studio.git/info/refs',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('does not follow a public redirect into the private network', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'http://10.0.0.7/admin' } }));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await proxied('evil.example.com/redirect');

    expect(response.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
