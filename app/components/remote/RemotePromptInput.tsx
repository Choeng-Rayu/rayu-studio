import { useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import {
  attachedSessionId,
  bridgeError,
  connectedSessions,
  connectionState,
  interrupt,
  isStreaming,
  sendPrompt,
} from '~/lib/webBridge/webBridgeStore';
import { canAcceptPrompt } from '~/lib/webBridge/webBridgeTypes';

/**
 * The composer.
 *
 * IT REFUSES OUT LOUD. A prompt aimed at an offline machine would be accepted by the
 * socket and then dropped, so the textarea disables itself and says WHY — "that
 * machine is offline" is actionable, a silently ignored Enter key is not.
 *
 * The stop button is enabled only while a turn is in flight, and it does not clear the
 * streaming state itself: that happens when the CLI's `interrupt_ack` comes back. A
 * button that instantly claims success would lie whenever the signal did not land.
 */

/** Matches MAX_PROMPT_CHARS in the backend, so a prompt cannot be rejected on arrival. */
const MAX_PROMPT_CHARS = 32_000;

export function RemotePromptInput(): React.JSX.Element {
  const [text, setText] = useState('');
  const attachedId = useStore(attachedSessionId);
  const sessions = useStore(connectedSessions);
  const streaming = useStore(isStreaming);
  const state = useStore(connectionState);
  const error = useStore(bridgeError);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const session = attachedId ? sessions.find((s) => s.id === attachedId) : undefined;
  const bridgeUp = state === 'connected';
  const sessionReady = canAcceptPrompt(session);
  const canSend = bridgeUp && sessionReady && text.trim().length > 0;

  const reason = !attachedId
    ? 'Pick a machine on the left to start.'
    : !bridgeUp
      ? 'Reconnecting to the bridge…'
      : !sessionReady
        ? 'That machine is offline. Run /web-bridge in rayu-cli to bring it back.'
        : null;

  const submit = () => {
    if (!canSend) {
      return;
    }

    sendPrompt(text.trim());
    setText('');

    /*
     * Height is reset with the value: a cleared textarea that stays four rows tall
     * looks broken.
     */
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <div className="space-y-1.5">
      {error && (
        <p role="alert" className="text-xs text-red-500 flex items-start gap-1">
          <span aria-hidden="true" className="i-ph:warning-circle-duotone shrink-0 mt-[1px]" />
          {error}
        </p>
      )}

      <div
        className={classNames(
          'rounded-lg border bg-rayu-elements-background-depth-2 transition-colors',
          reason ? 'border-rayu-elements-borderColor/60' : 'border-rayu-elements-borderColor',
        )}
      >
        <label className="sr-only" htmlFor="remote-prompt">
          Message this machine
        </label>
        <textarea
          id="remote-prompt"
          ref={textareaRef}
          value={text}
          rows={2}
          maxLength={MAX_PROMPT_CHARS}
          disabled={Boolean(reason)}
          aria-describedby={reason ? 'remote-prompt-reason' : undefined}
          onChange={(event) => {
            setText(event.target.value);

            // Grow to fit, capped so a pasted file cannot swallow the transcript.
            const node = event.target;
            node.style.height = 'auto';
            node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
          }}
          onKeyDown={(event) => {
            /*
             * Enter sends, Shift+Enter newlines — the convention every chat surface in
             * this product already uses, including the studio's own composer.
             */
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={reason ?? 'Type a message…'}
          className="w-full resize-none bg-transparent px-3 py-2.5 text-sm text-rayu-elements-textPrimary placeholder:text-rayu-elements-textTertiary focus:outline-none disabled:cursor-not-allowed modern-scrollbar"
        />

        <div className="flex items-center gap-2 px-2 pb-2">
          {reason && (
            <p id="remote-prompt-reason" className="text-[11px] text-rayu-elements-textTertiary flex-1 truncate">
              {reason}
            </p>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={interrupt}
              disabled={!streaming || !bridgeUp}
              title={streaming ? 'Stop this turn' : 'Nothing is running'}
              aria-label="Stop this turn"
              className="min-w-[44px] min-h-[36px] px-3 rounded-md text-sm border border-rayu-elements-borderColor text-rayu-elements-textSecondary hover:bg-rayu-elements-background-depth-3 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
            >
              <span aria-hidden="true" className="i-ph:stop-circle-duotone text-base align-[-2px]" />
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="min-h-[36px] px-4 rounded-md text-sm font-medium bg-rayu-elements-button-primary-background text-rayu-elements-button-primary-text hover:bg-rayu-elements-button-primary-backgroundHover disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
