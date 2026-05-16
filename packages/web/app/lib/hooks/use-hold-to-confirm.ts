import { useCallback, useEffect, useRef, useState } from 'react';

type HoldHandlers = {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
};

type UseHoldToConfirmReturn = {
  /** Spread onto the button. In `enabled=false` mode there's also an
   *  `onClick` here so the button fires on a regular tap (the hook handles
   *  both modes with one API). */
  handlers: HoldHandlers & { onClick?: (e: React.MouseEvent) => void };
  /** True while a hold is in progress and the confirm hasn't fired yet.
   *  Use this to render a snackbar / visual countdown. */
  isHolding: boolean;
  /** Seconds remaining in the current hold, integer 1..ceil(holdMs/1000).
   *  Null when not holding. Drives countdown microcopy ("Advancing in N..."). */
  secondsRemaining: number | null;
};

/**
 * Hold-to-confirm gesture for the queue-control-bar pivot's non-driver
 * bar-prev/next safety gate (docs/queue-control-bar-pivot.md, rule 6 + Phase 3).
 *
 * Behavior:
 * - `enabled=false` (driver, or surfaces where the gate doesn't apply):
 *   regular onClick fires `onConfirm` instantly.
 * - `enabled=true`: requires `holdMs` of sustained press before firing
 *   `onConfirm`. Release before the deadline cancels (no fire, `onCancel`
 *   fires for snackbar dismissal). `secondsRemaining` ticks down so the
 *   caller can render a countdown ("Advancing in 3... 2... 1...").
 *
 * Cleans up timers on unmount and on re-renders that change `enabled`.
 */
export function useHoldToConfirm(args: {
  enabled: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  holdMs?: number;
}): UseHoldToConfirmReturn {
  const { enabled, onConfirm, onCancel, holdMs = 3000 } = args;

  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const [isHolding, setIsHolding] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  const clearTimers = useCallback(() => {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    startedAtRef.current = null;
  }, []);

  const stopHold = useCallback(
    (didFire: boolean) => {
      clearTimers();
      setIsHolding(false);
      setSecondsRemaining(null);
      if (!didFire) onCancel?.();
    },
    [clearTimers, onCancel],
  );

  const startHold = useCallback(() => {
    clearTimers();
    startedAtRef.current = Date.now();
    setIsHolding(true);
    setSecondsRemaining(Math.ceil(holdMs / 1000));
    tickTimerRef.current = setInterval(() => {
      const startedAt = startedAtRef.current;
      if (startedAt === null) return;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, Math.ceil((holdMs - elapsed) / 1000));
      setSecondsRemaining(remaining);
    }, 250);
    completionTimerRef.current = setTimeout(() => {
      onConfirm();
      stopHold(true);
    }, holdMs);
  }, [clearTimers, holdMs, onConfirm, stopHold]);

  // Cleanup on unmount or when enabled flips so a re-renaming hold doesn't
  // leak timers.
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const handlers: HoldHandlers & { onClick?: (e: React.MouseEvent) => void } = enabled
    ? {
        onMouseDown: (e) => {
          // Prevent text selection / drag artefacts on long press.
          e.preventDefault();
          startHold();
        },
        onMouseUp: () => stopHold(false),
        onMouseLeave: () => stopHold(false),
        onTouchStart: () => startHold(),
        onTouchEnd: () => stopHold(false),
        onTouchCancel: () => stopHold(false),
      }
    : {
        onClick: () => onConfirm(),
        // No-op gesture handlers in instant mode so the same object shape
        // spreads cleanly onto an IconButton either way.
        onMouseDown: () => {},
        onMouseUp: () => {},
        onMouseLeave: () => {},
        onTouchStart: () => {},
        onTouchEnd: () => {},
        onTouchCancel: () => {},
      };

  return { handlers, isHolding, secondsRemaining };
}
