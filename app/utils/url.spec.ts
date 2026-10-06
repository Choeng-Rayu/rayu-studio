import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockedUrlError, fetchAllowedUrl, isAllowedUrl } from './url';

afterEach(() => vi.unstubAllGlobals());

describe('isAllowedUrl', () => {
  it.each([
    'https://github.com/choeng-rayu/rayu-studio.git/info/refs?service=git-upload-pack',
    'https://gitlab.example.com/group/repo.git',
    'http://example.com/page',
    'https://8.8.8.8/',
    'https://[2606:4700:4700::1111]/',
  ])('allows public destination %s', (url) => {
    expect(isAllowedUrl(url)).toBe(true);
  });

  it.each([
    ['loopback', 'http://127.0.0.1:8080/'],
    ['loopback written as a decimal number', 'http://2130706433/'],
    ['loopback written in hex', 'http://0x7f.1/'],
    ['localhost', 'http://localhost:5173/'],
    ['localhost subdomain', 'http://api.localhost/'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['Docker bridge', 'http://172.17.0.1:2375/version'],
    ['Docker host alias', 'http://host.docker.internal:8000/'],
    ['container name (single label)', 'http://coolify-db:5432/'],
    ['mDNS name', 'http://printer.local/'],
    ['private class A', 'https://10.0.0.5/'],
    ['private class C', 'https://192.168.1.1/'],
    ['carrier-grade NAT', 'https://100.64.0.1/'],
    ['unspecified', 'http://0.0.0.0:5173/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['IPv4-mapped IPv6 loopback', 'http://[::ffff:127.0.0.1]/'],
    ['IPv6 unique-local', 'http://[fd00::1]/'],
    ['IPv6 link-local', 'http://[fe80::1]/'],
    ['non-HTTP scheme', 'file:///etc/passwd'],
    ['not a URL', 'not a url'],
  ])('blocks %s', (_label, url) => {
    expect(isAllowedUrl(url)).toBe(false);
  });
});

describe('fetchAllowedUrl', () => {
  it('re-checks every redirect hop so a public URL cannot bounce to an internal one', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest/meta-data/' } }),
      );
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchAllowedUrl('https://public.example.com/start')).rejects.toBeInstanceOf(BlockedUrlError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://public.example.com/start',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('follows allowed relative redirects for GET and reports the final URL', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { Location: '/new-path' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchAllowedUrl('https://public.example.com/old-path');

    expect(result.url).toBe('https://public.example.com/new-path');
    expect(result.redirected).toBe(true);
    expect(await result.response.text()).toBe('ok');
  });

  it('does not follow redirects for requests with a body', async () => {
    const redirect = new Response(null, { status: 307, headers: { Location: 'https://other.example.com/' } });
    const fetchSpy = vi.fn().mockResolvedValueOnce(redirect);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchAllowedUrl('https://public.example.com/git-upload-pack', { method: 'POST', body: 'x' });

    expect(result.response.status).toBe(307);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refuses the first request too when it targets a private address', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(fetchAllowedUrl('http://10.0.0.1/')).rejects.toBeInstanceOf(BlockedUrlError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
