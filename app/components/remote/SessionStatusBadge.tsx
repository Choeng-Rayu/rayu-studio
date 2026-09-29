import { classNames } from '~/utils/classNames';
import type { WebBridgeSessionStatus } from '~/lib/webBridge/webBridgeTypes';

/**
 * live / idle / offline for one machine.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. Each state carries its own word, so the status
 * survives a monochrome display and any form of colour blindness — a green dot next
 * to a grey dot is meaningless to roughly one in twelve men. `role="status"` puts the
 * same information on the accessibility tree, where a screen reader announces it
 * when it changes.
 */

const STATUS_STYLES: Record<WebBridgeSessionStatus, { dot: string; text: string; label: string; hint: string }> = {
  live: {
    dot: 'bg-green-500',
    text: 'text-green-600 dark:text-green-400',
    label: 'Live',
    hint: 'Connected and active',
  },
  idle: {
    dot: 'bg-yellow-500',
    text: 'text-yellow-600 dark:text-yellow-400',
    label: 'Idle',
    hint: 'Connected, nothing running',
  },
  offline: {
    dot: 'bg-rayu-elements-textTertiary',
    text: 'text-rayu-elements-textTertiary',
    label: 'Offline',
    hint: 'The CLI is not connected — start rayu and run /web-bridge',
  },
};

interface SessionStatusBadgeProps {
  status: WebBridgeSessionStatus;
  className?: string;
}

export function SessionStatusBadge({ status, className }: SessionStatusBadgeProps): React.JSX.Element {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.offline;

  return (
    <span
      role="status"
      title={style.hint}
      className={classNames('inline-flex items-center gap-1 text-xs font-medium', style.text, className)}
    >
      <span
        aria-hidden="true"
        className={classNames(
          'inline-block w-1.5 h-1.5 rounded-full shrink-0',
          style.dot,

          /*
           * Only `live` pulses. An always-on animation would make the whole picker
           * twitch, and it would tell the user nothing about which machine is busy.
           */
          status === 'live' ? 'animate-pulse' : '',
        )}
      />
      {style.label}
    </span>
  );
}
