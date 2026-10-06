import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { answerQuestions, pendingQuestion } from '~/lib/webBridge/webBridgeStore';
import type { QuestionRequest } from '~/lib/webBridge/webBridgeTypes';
import { useArmed } from './useArmed';

/**
 * The agent's `AskUserQuestion` interview.
 *
 * MATCHES THE TOOL, not a simplification of it. The tool takes an ARRAY of questions,
 * each with its own options, its own optional header, per-option descriptions, and its
 * own multi-select flag — and it reads the answers back keyed by question text. A card
 * that showed one question and returned one string could not express the tool, so this
 * renders every question and submits the whole map at once.
 *
 * Every question also keeps a free-text field. An interview with options still routinely
 * has a better answer than any of them, and that is the same escape hatch the terminal
 * and the Telegram card both provide.
 */
export function QuestionCard(): React.JSX.Element | null {
  const pending = useStore(pendingQuestion);

  if (!pending || pending.questions.length === 0) {
    return null;
  }

  /*
   * Keyed on callId so a different interview starts from a clean form. Without this a
   * stale selection could be submitted against a question it was never shown for.
   */
  return <QuestionForm key={pending.callId} pending={pending} />;
}

function QuestionForm({ pending }: { pending: QuestionRequest }): React.JSX.Element {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const { questions } = pending;

  const toggle = (question: string, label: string, multiSelect: boolean): void => {
    setSelected((prev) => {
      const current = prev[question] ?? [];

      if (!multiSelect) {
        // Single-select behaves as a radio: picking replaces.
        return { ...prev, [question]: current[0] === label ? [] : [label] };
      }

      return {
        ...prev,
        [question]: current.includes(label) ? current.filter((l) => l !== label) : [...current, label],
      };
    });
  };

  /** An answer is the chosen labels joined, or the free text if the user typed one. */
  const answerFor = (question: string): string => {
    const typed = custom[question]?.trim();

    if (typed) {
      return typed;
    }

    /*
     * Joined with ", " to match the flattening the Telegram bridge performs — the tool's
     * `answers` map holds strings, not arrays.
     */
    return (selected[question] ?? []).join(', ');
  };

  const answers: Record<string, string> = {};

  for (const q of questions) {
    const value = answerFor(q.question);

    if (value) {
      answers[q.question] = value;
    }
  }

  const complete = questions.every((q) => Boolean(answers[q.question]));
  const armed = useArmed();

  const submit = () => {
    if (!complete || !armed) {
      return;
    }

    answerQuestions(pending.callId, answers);
  };

  return (
    <section
      role="alertdialog"
      aria-labelledby="question-title"
      className="rounded-lg border border-purple-500/40 bg-purple-500/5 p-4"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="i-ph:question-duotone text-xl text-purple-500 shrink-0 mt-0.5" />
        <h3 id="question-title" className="text-sm font-semibold text-rayu-elements-textPrimary">
          {questions.length === 1 ? 'The agent has a question' : `The agent has ${questions.length} questions`}
        </h3>
      </div>

      <div className="mt-3 space-y-4">
        {questions.map((q, qIndex) => {
          const chosen = selected[q.question] ?? [];
          const groupId = `q-${qIndex}`;

          return (
            <fieldset key={`${qIndex}-${q.question}`} className="min-w-0">
              <legend className="text-sm text-rayu-elements-textPrimary whitespace-pre-wrap break-words">
                {q.header && (
                  <span className="block text-[11px] uppercase tracking-wide text-rayu-elements-textTertiary">
                    {q.header}
                  </span>
                )}
                {q.question}
                {q.multiSelect && <span className="ml-1 text-[11px] text-rayu-elements-textTertiary">(pick any)</span>}
              </legend>

              {q.options.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.options.map((option, oIndex) => {
                    const active = chosen.includes(option.label);

                    return (
                      <button
                        key={`${oIndex}-${option.label}`}
                        type="button"
                        aria-pressed={active}
                        title={option.description}
                        onClick={() => toggle(q.question, option.label, q.multiSelect === true)}
                        className={classNames(
                          'min-h-[36px] px-3 rounded-md text-sm text-left transition-colors',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive',
                          active
                            ? 'border border-rayu-elements-borderColorActive bg-rayu-elements-background-depth-3 text-rayu-elements-textPrimary'
                            : 'border border-rayu-elements-borderColor bg-rayu-elements-background-depth-2 text-rayu-elements-textSecondary hover:border-rayu-elements-borderColorActive',
                        )}
                      >
                        <span className="block">{option.label}</span>
                        {/*
                         * The per-option explanation the terminal shows beneath the
                         * label. Rendered inline, not only as a tooltip: a tooltip is
                         * unreachable on touch, which is the surface this card exists for.
                         */}
                        {option.description && (
                          <span className="block text-[11px] text-rayu-elements-textTertiary">
                            {option.description}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <label className="sr-only" htmlFor={`${groupId}-custom`}>
                Your own answer
              </label>
              <input
                id={`${groupId}-custom`}
                type="text"
                value={custom[q.question] ?? ''}
                onChange={(event) => setCustom((prev) => ({ ...prev, [q.question]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && complete) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder={q.options.length > 0 ? 'Or answer in your own words…' : 'Type your answer…'}
                className="mt-2 w-full min-h-[36px] px-3 rounded-md text-sm bg-rayu-elements-background-depth-2 border border-rayu-elements-borderColor text-rayu-elements-textPrimary placeholder:text-rayu-elements-textTertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
              />
            </fieldset>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!complete || !armed}
          className="min-h-[36px] px-4 rounded-md text-sm font-medium bg-rayu-elements-button-primary-background text-rayu-elements-button-primary-text hover:bg-rayu-elements-button-primary-backgroundHover disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive"
        >
          Send {questions.length > 1 ? 'answers' : 'answer'}
        </button>
        {/*
         * Submitted as one map, so a partially filled interview is refused rather than
         * sent with gaps — the tool would otherwise receive an answer set missing keys
         * it asked for.
         */}
        {!complete && <p className="text-[11px] text-rayu-elements-textTertiary">Answer every question to send.</p>}
      </div>
    </section>
  );
}
