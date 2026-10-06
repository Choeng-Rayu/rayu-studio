import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { pendingPlanRequest, respondToPlan } from '~/lib/webBridge/webBridgeStore';
import type { PlanRequest } from '~/lib/webBridge/webBridgeTypes';
import { useArmed } from './useArmed';

/**
 * Plan-mode approval.
 *
 * THREE decisions, the same three the Telegram bridge's plan card offers
 * (rayu-cli src/telegram/telegramPlanApproval.ts) rather than the two an
 * approve/reject boolean would allow:
 *
 *  • Approve                       -> allow, no mode change
 *  • Approve and auto-accept edits -> allow + setMode acceptEdits (session-wide)
 *  • Keep planning, with feedback  -> deny + message
 *
 * EACH BUTTON SAYS WHAT IT LEADS TO, because the answer is not what the names alone
 * suggest. With no mode change, rayu-cli's ExitPlanMode tool applies the product rule
 * that a confirmed plan enters Orchestrator mode (rayu-cli AGENTS_ORCHESTRATOR.md),
 * where tools run without asking — broader than auto-accept edits, where commands still
 * ask. Both outcomes are pinned by rayu-cli test/webBridgePlanApprovalMode.test.ts; if
 * that test changes, this copy must change with it.
 *
 * The third one is the reason this card is not just a permission card. Rejecting a plan
 * with no explanation sends the model back to replan blind, and it will frequently
 * produce the same plan again. The feedback field is the whole value of a rejection.
 */
export function PlanApprovalCard(): React.JSX.Element | null {
  const pending = useStore(pendingPlanRequest);

  if (!pending) {
    return null;
  }

  // Keyed by callId: notes typed for one plan must never be sent with the next.
  return <PlanApprovalForm key={pending.callId} pending={pending} />;
}

function PlanApprovalForm({ pending }: { pending: PlanRequest }): React.JSX.Element {
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const armed = useArmed();

  const keepPlanning = () => {
    if (armed) {
      respondToPlan(pending.callId, false, { message: feedback.trim() || undefined });
    }
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
            Choose how the agent carries it out, or send it back with notes.
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

      <div className="mt-3 flex items-stretch gap-2 flex-wrap">
        {/*
         * The outcome is printed on each button, not left to a tooltip: tooltips are
         * unreachable on touch, and this is the decision a phone user is making.
         */}
        <button
          type="button"
          disabled={!armed}
          onClick={() => respondToPlan(pending.callId, true)}
          className="min-h-[36px] px-4 py-1.5 rounded-md text-sm font-medium text-left bg-rayu-elements-button-primary-background text-rayu-elements-button-primary-text hover:bg-rayu-elements-button-primary-backgroundHover disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
        >
          <span className="block">Approve · Orchestrator</span>
          <span className="block text-[11px] font-normal opacity-80">Tools then run without asking</span>
        </button>
        {/*
         * A SEPARATE button, never a checkbox on Approve. This changes the permission
         * mode for the rest of the session — subsequent edits stop asking — so it has to
         * be an explicit choice, and the label has to say what it does.
         */}
        <button
          type="button"
          disabled={!armed}
          onClick={() => respondToPlan(pending.callId, true, { acceptEdits: true })}
          className="min-h-[36px] px-4 py-1.5 rounded-md text-sm font-medium text-left border border-rayu-elements-borderColorActive text-rayu-elements-textPrimary hover:bg-rayu-elements-background-depth-2 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
        >
          <span className="block">Approve · auto-accept edits</span>
          <span className="block text-[11px] font-normal text-rayu-elements-textTertiary">
            Edits stop asking; commands still ask
          </span>
        </button>
        <button
          type="button"
          disabled={!armed}
          onClick={() => (showFeedback ? keepPlanning() : setShowFeedback(true))}
          className="min-h-[36px] px-4 rounded-md text-sm font-medium border border-rayu-elements-borderColor text-rayu-elements-textSecondary hover:bg-rayu-elements-background-depth-2 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
        >
          {showFeedback ? 'Send notes' : 'Keep planning…'}
        </button>
      </div>
    </section>
  );
}
