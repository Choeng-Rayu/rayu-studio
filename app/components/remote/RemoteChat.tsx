import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { Markdown } from '~/components/chat/Markdown';
import {
  attachedSessionId,
  connectedSessions,
  isStreaming,
  messageHistory,
  streamingContent,
} from '~/lib/webBridge/webBridgeStore';
import { sessionTitle, type BufferedMessage } from '~/lib/webBridge/webBridgeTypes';
import { PlanApprovalCard } from './PlanApprovalCard';
import { QuestionCard } from './QuestionCard';
import { RemotePromptInput } from './RemotePromptInput';
import { RemoteStreamMessage } from './RemoteStreamMessage';
import { SessionStatusBadge } from './SessionStatusBadge';
import { ToolApprovalCard } from './ToolApprovalCard';

/**
 * The conversation pane.
 *
 * FINISHED messages render through the studio's existing `Markdown` component, so a
 * remote answer gets the same syntax highlighting and sanitisation as a studio chat —
 * that component already runs rehype-sanitize, which matters because this content is
 * model output arriving over a socket. The LIVE tail is plain text
 * (`RemoteStreamMessage`) since re-parsing markdown per token is both slow and ugly.
 *
 * Approval cards sit BELOW the transcript and ABOVE the composer: they are the thing
 * being asked right now, so they belong next to where the user is about to act, not
 * buried at the point in history where the tool was called.
 */

function messageStyle(type: BufferedMessage['type']): string {
  switch (type) {
    case 'prompt':
      return 'bg-rayu-elements-background-depth-3 border-rayu-elements-borderColorActive/40';
    case 'thinking':
      return 'bg-transparent border-rayu-elements-borderColor/50';
    case 'tool':
      return 'bg-yellow-500/5 border-yellow-500/30';
    case 'activity':
      return 'bg-transparent border-transparent';
    default:
      return 'bg-rayu-elements-background-depth-2 border-rayu-elements-borderColor';
  }
}

function MessageBubble({ message }: { message: BufferedMessage }): React.JSX.Element {
  /*
   * Activity lines are status, not conversation: rendered as a thin centred note so a
   * run of them does not read like the agent talking.
   */
  if (message.type === 'activity') {
    return <p className="text-[11px] text-rayu-elements-textTertiary text-center py-0.5">{message.content}</p>;
  }

  if (message.type === 'tool') {
    return (
      <div className={classNames('rounded-lg border px-3 py-1.5 text-xs', messageStyle(message.type))}>
        <span aria-hidden="true" className="i-ph:wrench-duotone mr-1 align-[-2px] text-yellow-500" />
        <span className="text-rayu-elements-textSecondary">Ran </span>
        <span className="font-mono text-rayu-elements-textPrimary">{message.content}</span>
      </div>
    );
  }

  if (message.type === 'thinking') {
    return (
      <details className={classNames('rounded-lg border', messageStyle(message.type))}>
        <summary className="cursor-pointer px-3 py-1.5 text-xs text-rayu-elements-textTertiary select-none">
          Thinking
        </summary>
        <pre className="px-3 pb-2 text-xs font-mono text-rayu-elements-textTertiary whitespace-pre-wrap break-words">
          {message.content}
        </pre>
      </details>
    );
  }

  if (message.type === 'prompt') {
    return (
      <div className={classNames('rounded-lg border px-3 py-2 max-w-[85%] ml-auto', messageStyle(message.type))}>
        <p className="text-sm text-rayu-elements-textPrimary whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    );
  }

  return (
    <div className={classNames('rounded-lg border px-3 py-2', messageStyle(message.type))}>
      {/*
       * `html` is left FALSE (the default), which is stricter than the studio's own
       * chat. This content is model output relayed from another machine, and the
       * `html` flag is what turns on rehype-raw; with it off, raw HTML in an answer is
       * rendered as text instead of parsed at all. Nothing an agent needs to say
       * requires embedded markup, so the safer default is the correct one here.
       */}
      <Markdown>{message.content}</Markdown>
    </div>
  );
}

export function RemoteChat(): React.JSX.Element {
  const messages = useStore(messageHistory);
  const attachedId = useStore(attachedSessionId);
  const sessions = useStore(connectedSessions);
  const streaming = useStore(isStreaming);
  const liveText = useStore(streamingContent);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const session = attachedId ? sessions.find((s) => s.id === attachedId) : undefined;

  /*
   * Stick to the bottom only while the user is already there. Forcing a scroll on
   * every delta would yank the view away from someone reading back through the
   * transcript — the single most annoying behaviour a streaming log can have.
   */
  useEffect(() => {
    const node = scrollRef.current;

    if (node && pinnedRef.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, liveText, streaming]);

  const onScroll = () => {
    const node = scrollRef.current;

    if (!node) {
      return;
    }

    // 48px of slack so a near-bottom position still counts as pinned.
    pinnedRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
  };

  if (!attachedId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <span aria-hidden="true" className="i-ph:terminal-window-duotone text-4xl text-rayu-elements-textTertiary" />
          <h2 className="mt-3 text-base font-semibold text-rayu-elements-textPrimary">Pick a machine</h2>
          <p className="mt-1 text-sm text-rayu-elements-textSecondary">
            Choose a session on the left to see its recent messages and start driving it from here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {session && (
        <header className="flex items-center gap-3 px-4 py-2.5 border-b border-rayu-elements-borderColor shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-rayu-elements-textPrimary truncate">{sessionTitle(session)}</h2>
            <p className="text-xs text-rayu-elements-textTertiary font-mono truncate" title={session.cwd}>
              {session.cwd}
            </p>
          </div>
          <SessionStatusBadge status={session.status} className="ml-auto shrink-0" />
        </header>
      )}

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 modern-scrollbar">
        {messages.length === 0 && !streaming && (
          <p className="text-xs text-rayu-elements-textTertiary text-center py-6">
            No recent messages for this session.
          </p>
        )}

        {messages.map((message, index) => (
          <MessageBubble key={`${message.ts}-${index}`} message={message} />
        ))}

        <RemoteStreamMessage />
      </div>

      <div className="shrink-0 px-4 pb-3 space-y-3">
        <ToolApprovalCard />
        <PlanApprovalCard />
        <QuestionCard />
        <RemotePromptInput />
      </div>
    </div>
  );
}
