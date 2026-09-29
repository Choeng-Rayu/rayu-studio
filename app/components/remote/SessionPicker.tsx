import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { attachSession, attachedSessionId, connectedSessions, connectionState } from '~/lib/webBridge/webBridgeStore';
import { sessionTitle, shortenCwd, type WebBridgeSession } from '~/lib/webBridge/webBridgeTypes';
import { SessionStatusBadge } from './SessionStatusBadge';

/**
 * The machine list.
 *
 * OFFLINE SESSIONS ARE SHOWN, NOT HIDDEN, and they are still selectable. A user who
 * opens this page to check on a long task needs to see that the machine exists and is
 * asleep — hiding it would look like the session was lost. Selecting one loads its
 * replay buffer, which is often exactly what they came for; the composer is what
 * refuses, with a reason.
 */

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();

  if (Number.isNaN(then)) {
    return '';
  }

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));

  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.round(hours / 24)}d ago`;
}

interface SessionRowProps {
  session: WebBridgeSession;
  selected: boolean;
  onSelect: (id: string) => void;
}

function SessionRow({ session, selected, onSelect }: SessionRowProps): React.JSX.Element {
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(session.id)}
        className={classNames(
          'w-full text-left px-3 py-2.5 rounded-lg transition-colors',

          // 44px minimum touch target.
          'min-h-[44px]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-rayu-elements-borderColorActive',
          selected
            ? 'bg-rayu-elements-background-depth-3 border border-rayu-elements-borderColorActive'
            : 'border border-transparent hover:bg-rayu-elements-background-depth-2',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-rayu-elements-textPrimary truncate">{sessionTitle(session)}</span>
          <SessionStatusBadge status={session.status} className="shrink-0" />
        </div>
        <div className="mt-0.5 text-xs text-rayu-elements-textSecondary font-mono truncate" title={session.cwd}>
          {shortenCwd(session.cwd) || '—'}
        </div>
        <div className="mt-0.5 text-[11px] text-rayu-elements-textTertiary">
          {session.status === 'offline' ? `Last seen ${relativeTime(session.lastSeenAt)}` : session.hostname}
        </div>
      </button>
    </li>
  );
}

export function SessionPicker(): React.JSX.Element {
  const sessions = useStore(connectedSessions);
  const attachedId = useStore(attachedSessionId);
  const state = useStore(connectionState);

  return (
    <aside
      aria-label="Connected machines"
      className="w-[280px] shrink-0 border-r border-rayu-elements-borderColor flex flex-col bg-rayu-elements-background-depth-1"
    >
      <div className="px-4 py-3 border-b border-rayu-elements-borderColor">
        <h2 className="text-sm font-semibold text-rayu-elements-textPrimary">Machines</h2>
        <p className="mt-0.5 text-xs text-rayu-elements-textTertiary">
          {state === 'connected'
            ? `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`
            : 'Connecting to the bridge…'}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="flex-1 px-4 py-6 text-xs text-rayu-elements-textSecondary leading-relaxed">
          <p className="font-medium text-rayu-elements-textPrimary">No machines yet</p>
          <p className="mt-2">
            Run <code className="font-mono text-rayu-elements-textPrimary">/web-bridge</code> inside rayu-cli on any
            machine you have signed in on. It will appear here within a second.
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto p-2 space-y-1 modern-scrollbar">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              selected={session.id === attachedId}
              onSelect={attachSession}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}
