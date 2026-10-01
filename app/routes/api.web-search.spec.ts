import { afterEach, describe, expect, it, vi } from 'vitest';
import { action } from './api.web-search';

afterEach(() => vi.unstubAllGlobals());

const BACKEND = 'https://api.rayucode.com/api';
const accessToken = () => `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;

/** Answer the Rayu session check, and hand every other request to `handler`. */
function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  const fetchSpy = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);

    if (url === `${BACKEND}/me`) {
      return Response.json({ user: { id: 42, email: null, displayName: null, avatarUrl: null } });
    }

    return handler(url);
  });
  vi.stubGlobal('fetch', fetchSpy);

  return fetchSpy;
}

const search = (url: string, signedIn = true) =>
  action({
    request: new Request('http://studio.example.com/api/web-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(signedIn ? { Cookie: `rayu_access=${accessToken()}; rayu_refresh=refresh-token` } : {}),
      },
      body: JSON.stringify({ url }),
    }),
    params: {},
    context: { cloudflare: { env: { RAYU_BACKEND_URL: BACKEND } } },
  } as any);

describe('web search fetch', () => {
  it('requires a Rayu sign-in and does not fetch anything for anonymous callers', async () => {
    const fetchSpy = stubFetch(() => new Response('should not be fetched'));

    const response = await search('https://public.example.com/article', false);

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a public URL that redirects to an internal address', async () => {
    const pageFetches: string[] = [];
    stubFetch((url) => {
      pageFetches.push(url);
      return new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/' } });
    });

    const response = await search('https://public.example.com/article');

    expect(response.status).toBe(400);
    expect(pageFetches).toEqual(['https://public.example.com/article']);
  });

  it('returns page text for a public page', async () => {
    stubFetch(
      () =>
        new Response('<html><head><title>Docs</title></head><body><p>Hello world</p></body></html>', {
          headers: { 'content-type': 'text/html' },
        }),
    );

    const response = await search('https://public.example.com/docs');
    const payload = (await response.json()) as { data: { title: string; content: string } };

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(payload.data.title).toBe('Docs');
    expect(payload.data.content).toContain('Hello world');
  });
});
