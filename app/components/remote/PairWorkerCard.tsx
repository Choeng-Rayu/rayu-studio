import { useEffect, useState } from 'react';
import { API_BASE_URL } from '~/lib/rayu/config';
import { getAccessToken } from '~/lib/rayu/session';

interface WorkerPreview {
  hostname: string;
  cwd: string;
  sessionLabel?: string;
}

function clearPairQuery(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pair');
  window.history.replaceState(null, '', url);
}

/** Explicit consent: a QR scan alone must never grant remote tool approval. */
export function PairWorkerCard(): React.JSX.Element | null {
  const [challenge, setChallenge] = useState<string | null>(null);
  const [worker, setWorker] = useState<WorkerPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('pair');

    if (!value) {
      return undefined;
    }

    setChallenge(value);

    const controller = new AbortController();

    void (async () => {
      try {
        const token = await getAccessToken();

        if (!token) {
          throw new Error('Sign in to Studio to approve this machine.');
        }

        const response = await fetch(`${API_BASE_URL}/web-bridge/guest/preview/${encodeURIComponent(value)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('This pairing request has expired or was already used. Start /web-bridge again.');
        }

        setWorker((await response.json()) as WorkerPreview);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load the pairing request.');
        }
      }
    })();

    return () => controller.abort();
  }, []);

  if (!challenge) {
    return null;
  }

  const dismiss = () => {
    clearPairQuery();
    setChallenge(null);
  };

  const approve = async () => {
    setWorking(true);
    setError(null);

    try {
      const token = await getAccessToken();

      if (!token) {
        throw new Error('Sign in to Studio before approving.');
      }

      const response = await fetch(`${API_BASE_URL}/web-bridge/guest/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ challenge }),
      });

      if (!response.ok) {
        throw new Error('Pairing expired or was already approved. Start /web-bridge again.');
      }

      setApproved(true);
      clearPairQuery();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not approve this machine.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <section
      className="m-3 shrink-0 rounded-xl border border-rayu-elements-borderColorActive bg-rayu-elements-background-depth-2 p-4 text-rayu-elements-textPrimary"
      aria-label="Pair a worker"
    >
      <h2 className="text-base font-semibold">Pair this machine with Studio?</h2>
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
        {!approved && (
          <button
            type="button"
            disabled={!worker || working}
            onClick={() => void approve()}
            className="rounded-lg bg-rayu-elements-button-primary-background px-3 py-2 text-sm text-rayu-elements-button-primary-text disabled:opacity-50"
          >
            {working ? 'Approving…' : 'Approve machine'}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg border border-rayu-elements-borderColor px-3 py-2 text-sm"
        >
          {approved ? 'Done' : 'Cancel'}
        </button>
      </div>
    </section>
  );
}
