import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { connectionState, startWebBridge, stopWebBridge } from '~/lib/webBridge/webBridgeStore';
import type { BridgeConnectionState } from '~/lib/webBridge/webBridgeTypes';
import { RemoteChat } from './RemoteChat';
import { SessionPicker } from './SessionPicker';

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
    text: 'Could not reach the bridge. Check your connection and reload.',
    tone: 'text-red-500',
  },
};

export function RemotePage(): React.JSX.Element {
  const state = useStore(connectionState);

  useEffect(() => {
    void startWebBridge();

    return () => {
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
            'shrink-0 px-4 py-1.5 text-xs border-b border-rayu-elements-borderColor',
            'bg-rayu-elements-background-depth-2',
            banner.tone,
          )}
        >
          {banner.text}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <SessionPicker />
        <RemoteChat />
      </div>
    </div>
  );
}
