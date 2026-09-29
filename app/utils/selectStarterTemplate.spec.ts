import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamingMessageParser } from '~/lib/runtime/message-parser';
import { getTemplates, selectStarterTemplate } from './selectStarterTemplate';

afterEach(() => vi.unstubAllGlobals());

describe('starter template selection', () => {
  it('does not call a model or import a project for a greeting', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(
      await selectStarterTemplate({ message: 'Hi!', model: 'model-a', provider: { name: 'Rayu' } as any }),
    ).toEqual({ template: 'blank', title: '' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still classifies a real build request', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        Response.json({ text: '<selection><templateName>Vite React</templateName><title>My app</title></selection>' }),
      );
    vi.stubGlobal('fetch', fetchSpy);

    expect(
      await selectStarterTemplate({
        message: 'Hi, build a React app',
        model: 'model-a',
        provider: { name: 'Rayu' } as any,
      }),
    ).toEqual({ template: 'Vite React', title: 'My app' });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('omits generated lockfiles from the model-facing template artifact', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      Response.json([
        { name: 'package.json', path: 'package.json', content: '{"name":"app"}' },
        { name: 'package-lock.json', path: 'package-lock.json', content: 'LOCKFILE_PAYLOAD' },
        { name: 'pnpm-lock.yaml', path: 'nested/pnpm-lock.yaml', content: 'NESTED_LOCKFILE_PAYLOAD' },
      ]),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await getTemplates('Vite React', 'My app');
    expect(result?.assistantMessage).toContain('filePath="package.json"');
    expect(result?.assistantMessage).not.toContain('LOCKFILE_PAYLOAD');
    expect(result?.assistantMessage).not.toContain('package-lock.json');
    expect(result?.assistantMessage).not.toContain('pnpm-lock.yaml');

    const onActionClose = vi.fn();
    const parser = new StreamingMessageParser({ callbacks: { onActionClose } });
    parser.parse('template-import', result!.assistantMessage);
    expect(onActionClose).toHaveBeenCalledOnce();
    expect(onActionClose).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ type: 'file', filePath: 'package.json', content: '{"name":"app"}\n' }),
      }),
    );
  });
});
