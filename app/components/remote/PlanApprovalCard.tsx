import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { pendingPlanRequest, respondToPlan } from '~/lib/webBridge/webBridgeStore';

/**
 * Plan-mode approval.
 *
 * THREE decisions, matching rayu-cli's own plan card exactly
 * (src/telegram/telegramPlanApproval.ts) rather than the two an approve/reject boolean
 * would allow:
 *
 *  • Approve                       -> allow
 *  • Approve and auto-accept edits -> allow + setMode acceptEdits (session-wide)
 *  • Keep planning, with feedback  -> deny + message
 *
 * The third one is the reason this card is not just a permission card. Rejecting a plan
 * with no explanation sends the model back to replan blind, and it will frequently
 * produce the same plan again. The feedback field is the whole value of a rejection.
 */
export function PlanApprovalCard(): React.JSX.Element | null {
  const pending = useStore(pendingPlanRequest);
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  if (!pending) {
    return null;
  }

  const keepPlanning = () => {
    respondToPlan(false, { message: feedback.trim() || undefined });
    setFeedback('');
    setShowFeedback(false);
  };

  return (
    <section
      role="alertdialog"
      aria-labelledby="plan-approval-title"
      aria-describedby="plan-approval-body"
      className="rounded-lg border border-blue-500/40 bg-blue-500/5 p-4"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="i-ph:list-checks-duotone text-xl text-blue-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 id="plan-approval-title" className="text-sm font-semibold text-rayu-elements-textPrimary">
            Review the plan
          </h3>
          <p className="mt-0.5 text-xs text-rayu-elements-textSecondary">
            Approve to let the agent start, or send it back with notes.
          </p>
        </div>
      </div>

      {/*
       * Preformatted text, not markdown. Plans arrive as the CLI's own numbered prose;
       * rendering them as markdown would let a plan containing model-generated markup
       * restyle the approval card it appears in.
       */}
      <pre
        id="plan-approval-body"
        tabIndex={0}
        className="mt-3 max-h-72 overflow-auto rounded-md p-3 modern-scrollbar bg-rayu-elements-background-depth-2 border border-rayu-elements-borderColor text-xs text-rayu-elements-textPrimary whitespace-pre-wrap break-words focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
      >
        {pending.plan}
      </pre>

      {showFeedback && (
        <div className="mt-3">
          <label className="sr-only" htmlFor="plan-feedback">
            What should change?
          </label>
          <textarea
            id="plan-feedback"
            autoFocus
            rows={2}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                keepPlanning();
              }
            }}
            placeholder="What should change? The agent gets this verbatim…"
            className="w-full resize-none px-3 py-2 rounded-md text-sm bg-rayu-elements-background-depth-2 border border-rayu-elements-borderColor text-rayu-elements-textPrimary placeholder:text-rayu-elements-textTertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive modern-scrollbar"
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => respondToPlan(true)}
          className="min-h-[36px] px-4 rounded-md text-sm font-medium bg-rayu-elements-button-primary-background text-rayu-elements-button-primary-text hover:bg-rayu-elements-button-primary-backgroundHover focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
        >
          Approve
        </button>
        {/*
         * A SEPARATE button, never a checkbox on Approve. This changes the permission
         * mode for the rest of the session — subsequent edits stop asking — so it has to
         * be an explicit choice, and the label has to say what it does.
         */}
        <button
          type="button"
          onClick={() => respondToPlan(true, { acceptEdits: true })}
          title="Approve, and stop asking before each file edit for the rest of this session"
          className="min-h-[36px] px-4 rounded-md text-sm font-medium border border-rayu-elements-borderColorActive text-rayu-elements-textPrimary hover:bg-rayu-elements-background-depth-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
        >
          Approve + auto-accept edits
        </button>
        <button
          type="button"
          onClick={() => (showFeedback ? keepPlanning() : setShowFeedback(true))}
          className="min-h-[36px] px-4 rounded-md text-sm font-medium border border-rayu-elements-borderColor text-rayu-elements-textSecondary hover:bg-rayu-elements-background-depth-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
        >
          {showFeedback ? 'Send notes' : 'Keep planning…'}
        </button>
      </div>
    </section>
  );
}
