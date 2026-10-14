import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '~/lib/rayu/config';
import { getAccessToken } from '~/lib/rayu/session';
import { useArmed } from './useArmed';

interface WorkerPreview {
  hostname: string;
  cwd: string;
  sessionLabel?: string;
}

function clearPairQuery(onClear?: (approved: boolean) => void, approved = false): void {
  if (onClear) {
    onClear(approved);
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('pair');
  window.history.replaceState(window.history.state, '', url);
}

/** Explicit consent: a QR scan alone must never grant remote tool approval. */
export function PairWorkerCard({
  pairingChallenge,
  onClearPairing,
}: {
  pairingChallenge?: string | null;
  onClearPairing?: (approved: boolean) => void;
}): React.JSX.Element | null {
  const [challenge, setChallenge] = useState<string | null>(null);
  const [worker, setWorker] = useState<WorkerPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [approved, setApproved] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const workingRef = useRef(false);
  const armed = useArmed(undefined, challenge ? `${challenge}:${previewAttempt}` : null);

  useEffect(() => {
    const signOut = () => {
      controllerRef.current?.abort();
      workingRef.current = false;
      setWorking(false);
      setWorker(null);
      setError('Sign in to Studio to approve this machine.');
    };
    const authChanged = () => {
      controllerRef.current?.abort();
      setPreviewAttempt((attempt) => attempt + 1);
    };
    window.addEventListener('rayu-auth-signout', signOut);
    window.addEventListener('rayu-auth-change', authChanged);

    return () => {
      window.removeEventListener('rayu-auth-signout', signOut);
      window.removeEventListener('rayu-auth-change', authChanged);
    };
  }, []);

  useEffect(() => {
    const value =
      pairingChallenge === undefined ? new URLSearchParams(window.location.search).get('pair') : pairingChallenge;
    setChallenge(value);
    setWorker(null);
    setError(null);
    setApproved(false);
    setWorking(false);
    workingRef.current = false;

    if (!value) {
      return undefined;
    }

    if (!/^[A-Za-z0-9_-]{20,80}$/.test(value)) {
      setError('This QR code is invalid. Run /web-bridge pair for a new one.');
      return undefined;
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    void (async () => {
      try {
        const token = await getAccessToken();

        if (controller.signal.aborted) {
          return;
        }

        if (!token) {
          throw new Error('Sign in to Studio to approve this machine.');
        }

        const response = await fetch(`${API_BASE_URL}/web-bridge/guest/preview/${encodeURIComponent(value)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
        });

        if (!response.ok) {
          throw new Error(
            'This pairing request has expired or was already used. Run /web-bridge pair for a new QR code.',
          );
        }

        const preview = (await response.json()) as WorkerPreview;

        if (!controller.signal.aborted) {
          setWorker(preview);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load the pairing request.');
        }
      }
    })();

    return () => controller.abort();
  }, [pairingChallenge, previewAttempt]);

  if (!challenge) {
    return null;
  }

  const dismiss = () => {
    if (workingRef.current) {
      return;
    }

    controllerRef.current?.abort();
    clearPairQuery(onClearPairing);
    setChallenge(null);
  };

  const approve = async () => {
    const controller = controllerRef.current;

    if (!armed || !worker || !controller || controller.signal.aborted || workingRef.current || approved) {
      return;
    }

    workingRef.current = true;
    setWorking(true);
    setError(null);

    try {
      const token = await getAccessToken();

      if (controller.signal.aborted) {
        return;
      }

      if (!token) {
        throw new Error('Sign in to Studio before approving.');
      }

      const response = await fetch(`${API_BASE_URL}/web-bridge/guest/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ challenge }),
        signal: controller.signal,
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });

      if (!response.ok) {
        throw new Error('Pairing expired or was already approved. Run /web-bridge pair for a new QR code.');
      }

      if (controller.signal.aborted) {
        return;
      }

      setApproved(true);
      clearPairQuery(onClearPairing, true);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not approve this machine.');
      }
    } finally {
      if (controllerRef.current === controller) {
        workingRef.current = false;
        setWorking(false);
      }
    }
  };

  return (
    <section
      className="m-3 shrink-0 rounded-xl border border-rayu-elements-borderColorActive bg-rayu-elements-background-depth-2 p-4 text-rayu-elements-textPrimary"
      aria-label="Pair a worker"
    >
      <h2 className="text-base font-semibold">Pair this machine with Studio?</h2>
      {!worker && !error && (
        <p role="status" className="mt-2 text-sm">
          Loading machine details…
        </p>
      )}
      {worker && !approved && (
        <p className="mt-2 break-words text-sm">
          <span className="font-medium">{worker.sessionLabel || worker.hostname}</span> · {worker.hostname}
          <br />
          <span className="font-mono text-xs">{worker.cwd}</span>
        </p>
      )}
      <p className="mt-2 text-xs text-rayu-elements-textSecondary">
        Approving lets your Studio account send prompts and answer tool-permission requests on this running worker. It
        does not sign the worker into your Rayu account. Only approve a QR code shown on a machine you trust.
      </p>
      {approved && <p className="mt-2 text-sm">Approved. The machine will appear below when it connects.</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {error && !worker && /^[A-Za-z0-9_-]{20,80}$/.test(challenge) && (
          <button
            type="button"
            onClick={() => setPreviewAttempt((attempt) => attempt + 1)}
            className="rounded-lg border border-rayu-elements-borderColor px-3 py-2 text-sm"
          >
            Retry machine details
          </button>
        )}
        {!approved && (
          <button
            type="button"
            disabled={!worker || working || !armed}
            onClick={() => void approve()}
            className="rounded-lg bg-rayu-elements-button-primary-background px-3 py-2 text-sm text-rayu-elements-button-primary-text disabled:opacity-50"
          >
            {working ? 'Approving…' : 'Approve machine'}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          disabled={working}
          className="rounded-lg border border-rayu-elements-borderColor px-3 py-2 text-sm"
        >
          {approved ? 'Done' : 'Cancel'}
        </button>
      </div>
    </section>
  );
}
