// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { Message } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { useMessageParser } from './useMessageParser';
import { workbenchStore } from '~/lib/stores/workbench';

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    showWorkbench: { set: vi.fn() },
    addArtifact: vi.fn(),
    updateArtifact: vi.fn(),
    addAction: vi.fn(),
    runAction: vi.fn(),
  },
}));

const fileArtifact =
  '<rayuArtifact title="Project" type="bundled"><rayuAction type="file" filePath="app.ts">export const app = true;</rayuAction></rayuArtifact>';

describe('useMessageParser file actions', () => {
  it('does not replay actions when parsing the same finished conversation again', () => {
    const { result } = renderHook(() => useMessageParser());
    const messages = [{ id: 'assistant-1', role: 'assistant', content: fileArtifact }] as Message[];

    act(() => result.current.parseMessages(messages, false));
    act(() => result.current.parseMessages(messages, false));

    expect(workbenchStore.runAction).toHaveBeenCalledTimes(1);
    expect(result.current.parsedMessages[0]).toContain('__rayuArtifact__');
  });

  it('never turns a user-pasted code block into a file action', () => {
    vi.mocked(workbenchStore.runAction).mockClear();

    const { result } = renderHook(() => useMessageParser());
    const messages = [
      { id: 'user-1', role: 'user', content: 'Create app.ts:\n```ts\nexport const app = true;\n```' },
    ] as Message[];

    act(() => result.current.parseMessages(messages, false));

    expect(workbenchStore.runAction).not.toHaveBeenCalled();
  });

  it('keeps rendered assistant content when history inserts an earlier message', () => {
    const { result } = renderHook(() => useMessageParser());
    const assistant = { id: 'assistant-shifted', role: 'assistant', content: 'The answer.' } as Message;

    act(() => result.current.parseMessages([assistant], false));
    act(() =>
      result.current.parseMessages(
        [{ id: 'user-before', role: 'user', content: 'Question' } as Message, assistant],
        false,
      ),
    );

    expect(result.current.parsedMessages[1]).toBe('The answer.');
  });
});
