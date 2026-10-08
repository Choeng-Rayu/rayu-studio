import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogDescription, DialogRoot } from './Dialog';
import { Button } from './Button';
import { startRayuSignIn } from '~/lib/rayu-auth.client';

export type FeedbackType = 'bug' | 'idea' | 'other';

export interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Preselects the feedback type, e.g. 'bug' when opened from a bug-report entry point. */
  initialType?: FeedbackType;
}

const MAX_MESSAGE_LENGTH = 5000;

const TYPE_OPTIONS: Array<{ key: FeedbackType; label: string; icon: string }> = [
  { key: 'bug', label: 'Bug', icon: 'i-ph:bug' },
  { key: 'idea', label: 'Idea', icon: 'i-ph:lightbulb' },
  { key: 'other', label: 'Other', icon: 'i-ph:chat-circle' },
];

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ open, onOpenChange, initialType = 'bug' }) => {
  const [type, setType] = useState<FeedbackType>(initialType);
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [sent, setSent] = useState(false);

  // Reset the form each time the dialog is (re)opened so a previous submission does not linger.
  useEffect(() => {
    if (open) {
      setType(initialType);
      setMessage('');
      setRating(null);
      setBusy(false);
      setError('');
      setRequiresAuth(false);
      setSent(false);
    }
  }, [open, initialType]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = message.trim();

    if (!trimmed) {
      setError('Enter a message before sending your feedback.');
      return;
    }

    setBusy(true);
    setError('');
    setRequiresAuth(false);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message: trimmed, rating: rating ?? undefined }),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        code?: string;
      } | null;

      if (!response.ok || !result?.ok) {
        if (result?.code === 'rayu_auth_required' || response.status === 401) {
          setRequiresAuth(true);
        }

        setError(result?.error || 'Could not send your feedback. Please retry.');

        return;
      }

      setSent(true);
    } catch {
      setError('Could not reach the feedback service. Check your network and retry.');
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    setError('');

    try {
      await startRayuSignIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start sign-in.');
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog>
        <div className="py-4 px-4 w-[480px] max-w-[90vw] max-h-[85vh] flex flex-col gap-5 overflow-y-auto">
          <div>
            <DialogTitle className="text-2xl font-bold text-rayu-elements-textPrimary">Send Feedback</DialogTitle>
            <DialogDescription className="text-rayu-elements-textSecondary leading-relaxed">
              Share a bug, an idea, or anything else about RayuCode. Your feedback goes straight to the team.
            </DialogDescription>
          </div>

          {sent ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-500/10">
                <div className="i-ph:check-circle text-3xl text-accent-500" />
              </div>
              <div>
                <div className="font-semibold text-rayu-elements-textPrimary">Thanks for your feedback.</div>
                <p className="text-sm text-rayu-elements-textSecondary">We read every message that comes in.</p>
              </div>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          ) : (
            <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
              {/* Type selector */}
              <div>
                <div className="mb-2 text-sm font-medium text-rayu-elements-textPrimary">Type</div>
                <div className="flex gap-1 rounded-xl bg-rayu-elements-bg-depth-3 p-1">
                  {TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setType(option.key)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                        type === option.key
                          ? 'bg-rayu-elements-background-depth-3 text-rayu-elements-textPrimary shadow-md'
                          : 'bg-rayu-elements-background-depth-2 text-rayu-elements-textSecondary hover:bg-rayu-elements-bg-depth-2 hover:text-rayu-elements-textPrimary'
                      }`}
                    >
                      <span className={`${option.icon} text-lg`} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label
                  htmlFor="feedback-message"
                  className="mb-2 block text-sm font-medium text-rayu-elements-textPrimary"
                >
                  Message
                </label>
                <textarea
                  id="feedback-message"
                  value={message}
                  maxLength={MAX_MESSAGE_LENGTH}
                  disabled={busy}
                  rows={6}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Describe the bug or share your idea…"
                  className="w-full min-w-0 resize-none rounded-md border border-rayu-elements-borderColor bg-rayu-elements-background-depth-1 px-3 py-2 text-sm text-rayu-elements-textPrimary placeholder:text-rayu-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
                <div className="mt-1 text-right text-xs text-rayu-elements-textTertiary">
                  {message.length}/{MAX_MESSAGE_LENGTH}
                </div>
              </div>

              {/* Rating */}
              <div>
                <div className="mb-2 text-sm font-medium text-rayu-elements-textPrimary">
                  Rating <span className="font-normal text-rayu-elements-textTertiary">(optional)</span>
                </div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`Rate ${value} out of 5`}
                      aria-pressed={rating === value}
                      onClick={() => setRating((current) => (current === value ? null : value))}
                      className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                        rating && value <= rating
                          ? 'text-accent-500'
                          : 'text-rayu-elements-textTertiary hover:text-accent-500'
                      }`}
                    >
                      <div className={`${rating && value <= rating ? 'i-ph:star-fill' : 'i-ph:star'} text-xl`} />
                    </button>
                  ))}
                  {rating && <span className="text-sm text-rayu-elements-textSecondary">{rating}/5</span>}
                </div>
              </div>

              {error && (
                <div role="alert" className="break-words text-sm text-red-500">
                  {error}
                  {requiresAuth && (
                    <button
                      type="button"
                      onClick={() => void signIn()}
                      className="ml-1 text-accent-500 underline hover:text-accent-600"
                    >
                      Sign in to RayuCode
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <Button variant="secondary" type="button" disabled={busy} onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !message.trim()}
                  className="bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <div className="i-ph-spinner-gap-bold mr-2 h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    'Send Feedback'
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Dialog>
    </DialogRoot>
  );
};
