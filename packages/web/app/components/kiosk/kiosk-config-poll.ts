// Pure decision logic for the kiosk config-poll reload (kiosk-reliability.tsx).
// Extracted so the reload/wait state machine is unit-testable without React.

export type KioskConfigPollDecision =
  | { action: 'none' }
  | { action: 'reload' }
  /** Mismatch seen but the page is too young to reload safely — re-evaluate
   * after `delayMs` (when the SSR revalidate window has passed). */
  | { action: 'recheck'; delayMs: number };

export function evaluateKioskConfigPoll(input: {
  /** How long this page has been mounted. */
  pageAgeMs: number;
  /** The kiosk `updatedAt` the server render was built from. */
  initialUpdatedAt: string;
  /**
   * The freshest polled state: the kiosk's `updatedAt`, or `null` when the
   * kiosk vanished (deleted/hidden), or `undefined` when no poll has
   * succeeded yet.
   */
  polledUpdatedAt: string | null | undefined;
  /** Reload floor — must exceed the SSR fetch-cache revalidate window. */
  minPageAgeMs: number;
}): KioskConfigPollDecision {
  const { pageAgeMs, initialUpdatedAt, polledUpdatedAt, minPageAgeMs } = input;
  if (polledUpdatedAt === undefined) {
    return { action: 'none' };
  }
  const isMismatch = polledUpdatedAt === null || polledUpdatedAt !== initialUpdatedAt;
  if (!isMismatch) {
    return { action: 'none' };
  }
  if (pageAgeMs >= minPageAgeMs) {
    return { action: 'reload' };
  }
  return { action: 'recheck', delayMs: minPageAgeMs - pageAgeMs };
}
