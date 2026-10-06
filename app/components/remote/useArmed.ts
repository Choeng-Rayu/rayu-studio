import { useEffect, useState } from 'react';

/** How long a freshly shown approval card ignores its answer buttons. */
export const APPROVAL_ARM_DELAY_MS = 500;

/**
 * False for a moment after an approval card mounts.
 *
 * Approval cards stack in one place above the composer, so answering one shows the next
 * with its buttons exactly where the pointer already is. Without this pause, the second
 * click of a double-click approves a request nobody has read. Each card is keyed by its
 * callId, so every new request starts disarmed.
 */
export function useArmed(delayMs: number = APPROVAL_ARM_DELAY_MS): boolean {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return armed;
}
