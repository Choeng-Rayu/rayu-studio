import type { Message } from 'ai';
import { useCallback, useRef, useState } from 'react';
import { EnhancedStreamingMessageParser } from '~/lib/runtime/enhanced-message-parser';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMessageParser');

const createMessageParser = () =>
  new EnhancedStreamingMessageParser({
    callbacks: {
      onArtifactOpen: (data) => {
        logger.trace('onArtifactOpen', data);

        workbenchStore.showWorkbench.set(true);
        workbenchStore.addArtifact(data);
      },
      onArtifactClose: (data) => {
        logger.trace('onArtifactClose');

        workbenchStore.updateArtifact(data, { closed: true });
      },
      onActionOpen: (data) => {
        logger.trace('onActionOpen', data.action);

        /*
         * File actions are streamed, so we add them immediately to show progress
         * Shell actions are complete when created by enhanced parser, so we wait for close
         */
        if (data.action.type === 'file') {
          workbenchStore.addAction(data);
        }
      },
      onActionClose: (data) => {
        logger.trace('onActionClose', data.action);

        /*
         * Add non-file actions (shell, build, start, etc.) when they close
         * Enhanced parser creates complete shell actions, so they're ready to execute
         */
        if (data.action.type !== 'file') {
          workbenchStore.addAction(data);
        }

        workbenchStore.runAction(data);
      },
      onActionStream: (data) => {
        logger.trace('onActionStream', data.action);
        workbenchStore.runAction(data, true);
      },
    },
  });
const extractTextContent = (message: Message) =>
  Array.isArray(message.content)
    ? (message.content.find((item) => item.type === 'text')?.text as string) || ''
    : message.content;

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});
  const parserRef = useRef<EnhancedStreamingMessageParser | null>(null);
  const parsedRef = useRef<{ [key: number]: string }>({});
  const messageIdsRef = useRef<{ [key: number]: string }>({});

  if (!parserRef.current) {
    parserRef.current = createMessageParser();
  }

  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    const parser = parserRef.current!;
    const nextParsed = { ...parsedRef.current };
    const nextIds: { [key: number]: string } = {};
    let changed = false;

    for (const [index, message] of messages.entries()) {
      // User text is displayed directly and must never execute file actions.
      if (message.role !== 'assistant') {
        continue;
      }

      nextIds[index] = message.id;

      const content = parser.parse(message.id, extractTextContent(message), !isLoading);
      const enhancedContentReplaced = parser.consumeReplacement(message.id);
      const replace = messageIdsRef.current[index] !== message.id || enhancedContentReplaced;

      if (replace) {
        /*
         * A restored/rewound chat may move an already parsed message to a new
         * index. Its parser has no new delta, so retain the rendered text.
         */
        const previousIndex = Object.keys(messageIdsRef.current).find(
          (key) => messageIdsRef.current[Number(key)] === message.id,
        );
        nextParsed[index] =
          content || (previousIndex !== undefined ? parsedRef.current[Number(previousIndex)] : '') || '';
        changed = true;
      } else if (content) {
        nextParsed[index] = (nextParsed[index] || '') + content;
        changed = true;
      }
    }

    for (const index of Object.keys(nextParsed)) {
      if (!(Number(index) in nextIds)) {
        delete nextParsed[Number(index)];
        changed = true;
      }
    }
    messageIdsRef.current = nextIds;

    if (changed) {
      parsedRef.current = nextParsed;
      setParsedMessages(nextParsed);
    }
  }, []);

  return { parsedMessages, parseMessages };
}
