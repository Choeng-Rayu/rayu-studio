import { describe, expect, it } from 'vitest';
import { loader } from './webcontainer.connect.$id';
import { loader as previewLoader } from './webcontainer.preview.$id';

const connectPage = async (query: string) => {
  const response = (await loader({
    request: new Request(`https://studio.example.com/webcontainer/connect/abc${query}`),
    params: { id: 'abc' },
    context: {},
  } as any)) as Response;

  return response.text();
};

describe('WebContainer connect page', () => {
  it('passes a legitimate editor origin through as a JSON string', async () => {
    expect(await connectPage('?editorOrigin=https%3A%2F%2Fstudio.example.com')).toContain(
      'editorOrigin: "https://studio.example.com"',
    );
  });

  it.each([
    ['a quote that breaks out of the string', "';fetch('/api/auth/access-token');'"],
    ['a closing script tag', 'https://x.example/</script><script>alert(1)</script>'],
    ['a javascript: URL', 'javascript:alert(1)'],
  ])('cannot be used for script injection via %s', async (_label, payload) => {
    const html = await connectPage(`?editorOrigin=${encodeURIComponent(payload)}`);

    expect(html).not.toContain('/api/auth/access-token');
    expect(html).not.toContain('alert(1)');
    expect(html.match(/<script/g)).toHaveLength(1);
  });
});

describe('WebContainer preview page', () => {
  it('accepts a real preview id', async () => {
    const response = (await previewLoader({
      params: { id: 'k03e2io1v3fx9wvj0vr8qd5q58o56n-fkdo' },
      request: new Request('https://studio.example.com/'),
      context: {},
    } as any)) as Response;

    expect(await response.json()).toEqual({ previewId: 'k03e2io1v3fx9wvj0vr8qd5q58o56n-fkdo' });
  });

  it('rejects an id that would point the preview iframe at another site', async () => {
    await expect(
      previewLoader({
        params: { id: 'evil.example/?' },
        request: new Request('https://studio.example.com/'),
        context: {},
      } as any),
    ).rejects.toMatchObject({ status: 400 });
  });
});
