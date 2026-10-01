import { afterEach, describe, expect, it, vi } from 'vitest';
import { action } from './api.web-search';

afterEach(() => vi.unstubAllGlobals());

const search = (url: string) =>
  action({
    request: new Request('http://studio.example.com/api/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
    params: {},
    context: {},
  } as any);

describe('web search fetch', () => {
  it('rejects a public URL that redirects to an internal address', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/' } }));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await search('https://public.example.com/article');

    expect(response.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns page text for a public page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><head><title>Docs</title></head><body><p>Hello world</p></body></html>', {
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );

    const response = await search('https://public.example.com/docs');
    const payload = (await response.json()) as { data: { title: string; content: string } };

    expect(response.status).toBe(200);
    expect(payload.data.title).toBe('Docs');
    expect(payload.data.content).toContain('Hello world');
  });
});
