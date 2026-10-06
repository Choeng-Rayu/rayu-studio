import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { pendingToolCall, respondToTool, toolCallsWaiting } from '~/lib/webBridge/webBridgeStore';
import type { ToolCallRequest } from '~/lib/webBridge/webBridgeTypes';
import { useArmed } from './useArmed';

/**
 * The permission gate, rendered in the browser.
 *
 * THIS IS A SECURITY CONTROL, NOT A NOTIFICATION. The CLI is blocked on the far end
 * until one of these buttons is pressed, and prompts arriving over the bridge carry
 * the same trust level as prompts typed at a terminal — so this card is the one thing
 * standing between a remote prompt and a file write. Three consequences in the markup:
 *
 *  • The tool input is shown BEFORE the buttons, not behind a "details" toggle that a
 *    user would skip. An approval the user cannot see the subject of is not consent.
 *  • Deny is the visually neutral action and Allow is the deliberate one, but neither
 *    is the default: there is no auto-focus and no Enter-to-approve.
 *  • "Don't ask again" is opt-in per decision and is spelled out as durable, because
 *    it is the only control here that outlives the moment.
 */

/** Long inputs are scrolled, not truncated: a hidden path is a hidden consequence. */
const MAX_PREVIEW_HEIGHT = '14rem';

function formatInput(input: unknown): string {
  if (input === null || input === undefined) {
    return '(no arguments)';
  }

  if (typeof input === 'string') {
    return input;
  }

  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function ToolApprovalCard(): React.JSX.Element | null {
  const pending = useStore(pendingToolCall);
  const waiting = useStore(toolCallsWaiting);

  if (!pending) {
    return null;
  }

  /*
   * Keyed by callId so every request starts from a clean form. Without the key the
   * form's state outlived the request it belonged to: a ticked "Don't ask again" was
   * still ticked for the NEXT tool, turning a one-off approval into a durable grant
   * nobody chose.
   */
  return <ToolApprovalForm key={pending.callId} pending={pending} waiting={waiting} />;
}

function ToolApprovalForm({ pending, waiting }: { pending: ToolCallRequest; waiting: number }): React.JSX.Element {
  const [remember, setRemember] = useState(false);
  const [reason, setReason] = useState('');
  const [showReason, setShowReason] = useState(false);
  const armed = useArmed();

  const preview = formatInput(pending.toolInput);

  /** Answer THIS card's request; ignored until the card has been on screen briefly. */
  const answer = (decision: 'allow' | 'deny') => {
    if (!armed) {
      return;
    }

    respondToTool(
      pending.callId,
      decision,
      decision === 'allow' ? { remember } : { message: reason.trim() || undefined },
    );
  };

  return (
    <section
      role="alertdialog"
      aria-labelledby="tool-approval-title"
      aria-describedby="tool-approval-input"
      className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-4"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="i-ph:shield-warning-duotone text-xl text-yellow-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 id="tool-approval-title" className="text-sm font-semibold text-rayu-elements-textPrimary">
            Allow <span className="font-mono">{pending.toolName}</span>?
          </h3>
          {/*
           * The agent's own justification, when it gave one. A tool name plus a JSON
           * blob is a materially worse basis for consent than a sentence saying why.
           */}
          {pending.description && (
            <p className="mt-1 text-xs text-rayu-elements-textSecondary">{pending.description}</p>
          )}
          <p className="mt-0.5 text-xs text-rayu-elements-textSecondary">
            The agent is waiting on this machine until you answer.
            {waiting > 1 &&
              ` ${waiting - 1} more ${waiting === 2 ? 'request is' : 'requests are'} queued after this one.`}
          </p>
        </div>
      </div>

      {/*
       * Surfaced prominently and separately: the tool was stopped for reaching OUTSIDE
       * the workspace, which is a different and more serious question than an ordinary
       * approval. Burying it in the JSON would be the wrong emphasis.
       */}
      {pending.blockedPath && (
        <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-500">
          <span aria-hidden="true" className="i-ph:folder-lock-duotone mr-1 align-[-2px]" />
          Outside the workspace: <span className="font-mono break-all">{pending.blockedPath}</span>
        </p>
      )}

      <pre
        id="tool-approval-input"
        tabIndex={0}
        className={classNames(
          'mt-3 overflow-auto rounded-md p-3 modern-scrollbar',
          'bg-rayu-elements-background-depth-2 border border-rayu-elements-borderColor',
          'text-xs font-mono text-rayu-elements-textPrimary whitespace-pre-wrap break-words',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive',
        )}
        style={{ maxHeight: MAX_PREVIEW_HEIGHT }}
      >
        {preview}
      </pre>

      <label className="mt-3 flex items-center gap-2 text-xs text-rayu-elements-textSecondary cursor-pointer">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="w-4 h-4 accent-rayu-elements-borderColorActive"
        />
        Don&apos;t ask again for <span className="font-mono">{pending.toolName}</span>
        {/*
         * Named honestly. The grant is expanded from the CLI's own permissionSuggestions
         * when it offered them, which can be narrower than the whole tool (e.g.
         * `Bash(git:*)`), so the label says which it will be rather than guessing.
         */}
        {pending.permissionSuggestions?.length ? ' (using the agent\u2019s suggested rule)' : ''}
      </label>

      {/*
       * Deny-with-reason. Optional and collapsed by default so the common case stays one
       * click, but present because a denial the model cannot understand tends to be
       * retried verbatim.
       */}
      {showReason ? (
        <div className="mt-3">
          <label className="sr-only" htmlFor="tool-deny-reason">
            Why are you denying this?
          </label>
          <input
            id="tool-deny-reason"
            type="text"
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                answer('deny');
              }
            }}
            placeholder="Tell the agent what to do instead…"
            className="w-full min-h-[36px] px-3 rounded-md text-sm bg-rayu-elements-background-depth-2 border border-rayu-elements-borderColor text-rayu-elements-textPrimary placeholder:text-rayu-elements-textTertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
          />
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={!armed}
          onClick={() => answer('allow')}
          className="min-h-[36px] px-4 rounded-md text-sm font-medium bg-rayu-elements-button-primary-background text-rayu-elements-button-primary-text hover:bg-rayu-elements-button-primary-backgroundHover disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
        >
          Allow
        </button>
        <button
          type="button"
          disabled={!armed}
          onClick={() => answer('deny')}
          className="min-h-[36px] px-4 rounded-md text-sm font-medium border border-rayu-elements-borderColor text-rayu-elements-textSecondary hover:bg-rayu-elements-background-depth-2 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
        >
          Deny
        </button>
        {!showReason && (
          <button
            type="button"
            onClick={() => setShowReason(true)}
            className="min-h-[36px] px-3 rounded-md text-xs text-rayu-elements-textTertiary hover:text-rayu-elements-textSecondary focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
          >
            Deny with a reason…
          </button>
        )}
      </div>
    </section>
  );
}
