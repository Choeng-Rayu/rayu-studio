// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePromptEnhancer } from './usePromptEnhancer';

const { connect, info, error } = vi.hoisted(() => ({ connect: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('~/components/deploy/StudioConnectionDialog', () => ({ requireStudioAIConnection: connect }));
vi.mock('react-toastify', () => ({ toast: { info, error } }));
vi.mock('~/lib/stores/deploymentConnections', () => ({
  deploymentConnections: { get: () => ({ userId: 42, connections: {} }) },
}));

const provider = { name: 'Rayu' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  connect.mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('prompt enhancement connection recovery', () => {
  it('keeps an error response out of the prompt and exits the loading state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Sign in' }, { status: 401 })));

    const input = vi.fn();
    const { result } = renderHook(usePromptEnhancer);
    await act(() => result.current.enhancePrompt('Original prompt', input, 'model', provider));
    expect(input).toHaveBeenLastCalledWith('Original prompt');
    expect(result.current.enhancingPrompt).toBe(false);
    expect(result.current.promptEnhanced).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
  });
  it('streams a successful enhancement without logging or replacing it with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Enhanced prompt')));

    const input = vi.fn();
    const { result } = renderHook(usePromptEnhancer);
    await act(() => result.current.enhancePrompt('Original prompt', input, 'model', provider));
    expect(input).toHaveBeenLastCalledWith('Enhanced prompt');
    expect(result.current.promptEnhanced).toBe(true);
    expect(result.current.enhancingPrompt).toBe(false);
  });
  it('opens only one connection attempt for duplicate clicks and does not generate after cancellation', async () => {
    let cancel!: (value: boolean) => void;
    connect.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          cancel = resolve;
        }),
    );

    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const input = vi.fn();
    const { result } = renderHook(usePromptEnhancer);
    await act(async () => {
      const first = result.current.enhancePrompt('Original prompt', input, 'model', provider);
      await result.current.enhancePrompt('Original prompt', input, 'model', provider);
      cancel(false);
      await first;
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(input).not.toHaveBeenCalled();
  });
  it('gives feedback for an empty prompt without connecting or generating', async () => {
    const { result } = renderHook(usePromptEnhancer);
    await act(() => result.current.enhancePrompt('  ', vi.fn(), 'model', provider));
    expect(info).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
  });
});
