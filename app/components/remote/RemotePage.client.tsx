import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { useSearchParams } from '@remix-run/react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { connectionState, startWebBridge, stopWebBridge } from '~/lib/webBridge/webBridgeStore';
import { getAccessToken } from '~/lib/rayu/session';
import type { BridgeConnectionState } from '~/lib/webBridge/webBridgeTypes';
import { RemoteChat } from './RemoteChat';
import { SessionPicker } from './SessionPicker';
import { PairWorkerCard } from './PairWorkerCard';

/**
 * `/remote` — drive a rayu-cli session from the standalone Studio app.
 *
 * Owns the socket's LIFETIME and nothing else: everything below reads the store. The
 * connection opens on mount and closes on unmount, which is the correct scope because
 * leaving this page means the user is no longer watching — and closing the socket
 * costs nothing, since the CLI keeps running regardless and the replay buffer is what
 * makes coming back cheap.
 */

const CONNECTION_LABEL: Record<BridgeConnectionState, { text: string; tone: string } | null> = {
  /*
   * A healthy connection says nothing. A permanent "Connected" banner is noise that
   * trains the user to ignore the one place errors will appear.
   */
  connected: null,
  idle: null,
  connecting: { text: 'Connecting to the bridge…', tone: 'text-rayu-elements-textSecondary' },
  reconnecting: {
    text: 'Reconnecting… your session on the machine is still running.',
    tone: 'text-yellow-600 dark:text-yellow-400',
  },
  error: {
    text: 'Could not reach the bridge. Check your connection and try again.',
    tone: 'text-red-500',
  },
};

export function RemotePage(): React.JSX.Element {
  const state = useStore(connectionState);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let active = true;
    let authGeneration = 0;
    const signOut = () => {
      authGeneration++;
      stopWebBridge();
    };
    const authChanged = () => {
      const requestGeneration = ++authGeneration;
      stopWebBridge();
      void getAccessToken()
        .then((token) => {
          if (active && authGeneration === requestGeneration && token) {
            void startWebBridge();
          }
        })
        .catch(() => {
          if (active && authGeneration === requestGeneration) {
            connectionState.set('error');
          }
        });
    };
    void startWebBridge();
    window.addEventListener('rayu-auth-signout', signOut);
    window.addEventListener('rayu-auth-change', authChanged);

    return () => {
      active = false;
      window.removeEventListener('rayu-auth-signout', signOut);
      window.removeEventListener('rayu-auth-change', authChanged);
      stopWebBridge();
    };
  }, []);

  const banner = CONNECTION_LABEL[state];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {banner && (
        <div
          role="status"
          className={classNames(
            'shrink-0 flex items-center gap-3 px-4 py-1.5 text-xs border-b border-rayu-elements-borderColor',
            'bg-rayu-elements-background-depth-2',
            banner.tone,
          )}
        >
          {banner.text}
          {state === 'error' && (
            <button
              type="button"
              className="ml-auto shrink-0 rounded-md border border-rayu-elements-borderColor px-3 py-2 text-rayu-elements-textPrimary"
              onClick={() => {
                stopWebBridge();
                void startWebBridge();
              }}
            >
              Retry connection
            </button>
          )}
        </div>
      )}

      <PairWorkerCard
        pairingChallenge={searchParams.get('pair')}
        onClearPairing={(approved) => {
          if (approved) {
            toast.info('Machine approved. Choose it in Machines when it connects.');
          }

          setSearchParams(
            (params) => {
              const next = new URLSearchParams(params);
              next.delete('pair');

              return next;
            },
            { replace: true },
          );
        }}
      />

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <SessionPicker />
        <RemoteChat />
      </div>
    </div>
  );
}
