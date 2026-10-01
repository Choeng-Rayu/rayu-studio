import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitlabApiBase, gitlabProjectPathSegment } from '~/lib/api/gitlab';
import { action as branchesAction } from './api.gitlab-branches';
import { action as projectsAction } from './api.gitlab-projects';

afterEach(() => vi.unstubAllGlobals());

const post = (path: string, body: unknown) =>
  new Request(`https://studio.example.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify(body),
  });

describe('gitlabApiBase', () => {
  it('keeps public self-hosted instances, including a sub-path, and defaults to gitlab.com', () => {
    expect(gitlabApiBase(undefined)).toBe('https://gitlab.com');
    expect(gitlabApiBase('https://git.example.com/')).toBe('https://git.example.com');
    expect(gitlabApiBase('https://example.com/gitlab')).toBe('https://example.com/gitlab');
  });

  it('drops query, fragment and credentials so the API path cannot be replaced', () => {
    expect(gitlabApiBase('https://user:pw@git.example.com/x?redirect=#frag')).toBe('https://git.example.com/x');
  });

  it.each(['http://169.254.169.254', 'http://coolify-db:5432', 'http://localhost:8080', 'file:///etc/passwd'])(
    'refuses %s',
    (value) => {
      expect(gitlabApiBase(value)).toBeNull();
    },
  );

  it('encodes project ids as one path segment', () => {
    expect(gitlabProjectPathSegment(42)).toBe('42');
    expect(gitlabProjectPathSegment('group/project')).toBe('group%2Fproject');
    expect(gitlabProjectPathSegment('group%2Fproject')).toBe('group%2Fproject');
    expect(gitlabProjectPathSegment('../../admin')).toBe('..%2F..%2Fadmin');
    expect(gitlabProjectPathSegment('')).toBeNull();
  });
});

describe('GitLab proxy routes', () => {
  it('do not fetch internal addresses passed as gitlabUrl', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const projects = await projectsAction({
      request: post('/api/gitlab-projects', { token: 't', gitlabUrl: 'http://169.254.169.254/latest?' }),
      params: {},
      context: {},
    } as any);
    const branches = await branchesAction({
      request: post('/api/gitlab-branches', { token: 't', gitlabUrl: 'http://10.0.0.5', projectId: 1 }),
      params: {},
      context: {},
    } as any);

    expect(projects.status).toBe(400);
    expect(branches.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still lists projects from gitlab.com', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        Response.json([{ id: 7, name: 'site', path_with_namespace: 'me/site', http_url_to_repo: 'https://x' }]),
      );
    vi.stubGlobal('fetch', fetchSpy);

    const response = await projectsAction({
      request: post('/api/gitlab-projects', { token: 't' }),
      params: {},
      context: {},
    } as any);
    const payload = (await response.json()) as { total: number };

    expect(response.status).toBe(200);
    expect(payload.total).toBe(1);
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/^https:\/\/gitlab\.com\/api\/v4\/projects\?membership=true/);
  });
});
