import type { TickStatus } from '@boardsesh/shared-schema';

export type { TickStatus };

export type QuickTickState = {
  quality: number | null;
  difficulty: number | undefined;
  attemptCount: number;
};

export function createInitialTickState(): QuickTickState {
  return {
    quality: null,
    difficulty: undefined,
    attemptCount: 1,
  };
}

export function deriveAscentType(hasPriorHistory: boolean, attemptCount: number): 'flash' | 'send' {
  return !hasPriorHistory && attemptCount === 1 ? 'flash' : 'send';
}

/**
 * Lowest tries value any tick can carry: logging an ascent or an attempt means
 * you got on the climb at least once. The tries picker's floor and the
 * save-time clamp both read this one constant, so the number on screen and the
 * number on the wire cannot drift apart.
 */
export const MIN_ATTEMPT_COUNT = 1;

/**
 * Normalise tries before they go on the wire. Mirrors the server's
 * `SaveTickInputSchema`: at least 1, and exactly 1 for a flash (a flash is a
 * first-go ascent by definition).
 *
 * There is deliberately NO floor above 1 for `send`. A send only means "not a
 * flash of this climb" — the flash/send split is carried by `status`, never by
 * the number — so a redpoint that goes first go in the current session is a
 * genuine 1-try send. Flooring `send` at 2 (which this used to do, via a
 * `getMinAttempts` helper that no longer exists) stored a 2 behind a picker
 * still showing 1, and made 1 unreachable for every climber who had touched
 * the climb before. See issue #2888.
 */
export function clampAttempts(attemptCount: number, status: TickStatus): number {
  if (status === 'flash') return MIN_ATTEMPT_COUNT;
  return Math.max(MIN_ATTEMPT_COUNT, attemptCount);
}
