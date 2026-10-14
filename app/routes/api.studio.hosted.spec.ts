import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { getRayuAuth } from '~/lib/.server/rayu-auth';
import { loader as gitProxy } from './api.git-proxy.$';
import { loader as templateLoader } from './api.github-template';
import { STARTER_TEMPLATES } from '~/utils/constants';

vi.mock('~/lib/.server/rayu-auth', () => ({
  getRayuAuth: vi.fn(),
  backendApiBase: () => 'https://backend.test/api',
  publicOrigin: (request: Request) => new URL(request.url).origin,
  appendAuthCookies: (headers: Headers) => headers,
}));
beforeEach(() => {
  vi.stubGlobal('__STUDIO_DESKTOP__', false);
  vi.mocked(getRayuAuth).mockResolvedValue({
    accessToken: 'owner-session',
    user: { id: 42, email: null, displayName: null, avatarUrl: null },
    setCookies: [],
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('hosted repository transport', () => {
  it('uses the authenticated backend and strips browser GitHub credentials', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response('pack', { headers: { 'Content-Type': 'application/x-git-upload-pack-advertisement' } }),
      );
    vi.stubGlobal('fetch', fetchSpy);

    const path = 'github.com/owner/repo.git/info/refs';
    const response = await gitProxy({
      request: new Request(`https://studio.rayucode.com/api/git-proxy/${path}?service=git-upload-pack`, {
        headers: { Authorization: 'Basic browser-credential' },
      }),
      params: { '*': path },
      context: {},
    } as any);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(String(fetchSpy.mock.calls[0][0])).toContain('https://backend.test/api/studio/git-proxy/github.com/');
    expect(JSON.stringify(fetchSpy.mock.calls[0][1])).not.toContain('browser-credential');
    expect(new Headers(fetchSpy.mock.calls[0][1].headers).get('x-rayu-token')).toBe('owner-session');
  });
  it('refuses an unauthenticated git proxy request', async () => {
    vi.mocked(getRayuAuth).mockResolvedValue(null);

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await gitProxy({
      request: new Request(
        'https://studio.rayucode.com/api/git-proxy/github.com/o/r.git/info/refs?service=git-upload-pack',
      ),
      params: { '*': 'github.com/o/r.git/info/refs' },
      context: {},
    } as any);
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('imports allow-listed public starters without requiring GitHub credentials or using shared keys', async () => {
    const repo = STARTER_TEMPLATES[0].githubRepo;
    const zip = new JSZip();
    zip.file('starter/index.html', '<p>public starter</p>');

    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ zipball_url: `https://api.github.com/repos/${repo}/zipball/latest` }))
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await templateLoader({
      request: new Request(`https://studio.rayucode.com/api/github-template?repo=${repo}`),
      context: { cloudflare: { env: { GITHUB_TOKEN: 'shared-secret', RUNNING_IN_DOCKER: 'true' } } },
    });
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    for (const call of fetchSpy.mock.calls) {
      expect(new Headers(call[1]?.headers).get('Authorization')).toBeNull();
    }
  });
});
