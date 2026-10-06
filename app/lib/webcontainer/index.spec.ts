import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { boot } = vi.hoisted(() => ({ boot: vi.fn() }));

vi.mock('@webcontainer/api', () => ({ WebContainer: { boot } }));
vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: { actionAlert: { set: vi.fn() } } }));

beforeEach(() => {
  vi.resetModules();
  boot.mockReset();
  vi.stubEnv('SSR', false);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => 'inspector script' }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('WebContainer startup', () => {
  it('does not boot when imported and boots only once when requested', async () => {
    const container = { setPreviewScript: vi.fn(), on: vi.fn() };
    boot.mockResolvedValue(container);

    const { startWebContainer, webcontainer, webcontainerContext } = await import('./index');

    expect(boot).not.toHaveBeenCalled();

    const first = startWebContainer();
    const second = startWebContainer();

    expect(first).toBe(webcontainer);
    expect(second).toBe(first);
    await expect(first).resolves.toBe(container);
    expect(boot).toHaveBeenCalledTimes(1);
    expect(webcontainerContext.loaded).toBe(true);
    expect(container.setPreviewScript).toHaveBeenCalledWith('inspector script');
  }, 15_000);
});
