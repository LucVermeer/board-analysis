'use client';

import { useEffect, useRef } from 'react';

type UseScrollDirectionOptions = {
  /** Cumulative upward scroll (px) before firing `onUp`. Resets when direction flips. Defaults to 24. */
  upThresholdPx?: number;
  /** Cumulative downward scroll (px) before firing `onDown`. Resets when direction flips. Defaults to 4. */
  downThresholdPx?: number;
  /** When false, the listener is detached and no callbacks fire. Defaults to true. */
  enabled?: boolean;
  /** Fired when cumulative upward scroll crosses the threshold. */
  onUp?: () => void;
  /** Fired when cumulative downward scroll crosses the threshold. */
  onDown?: () => void;
};

/**
 * Fire a callback when the user scrolls past an asymmetric upward/downward
 * threshold. RAF-coalesced; passive listener. Each accumulator resets after
 * its callback fires, so a single deliberate scroll fires once — there's no
 * sticky direction state that can re-fire on unrelated re-renders.
 *
 * Thresholds and callbacks are stored in refs so callers can pass changing
 * values without churning the listener — the effect only resubscribes when
 * `enabled` flips.
 */
export function useScrollDirection({
  upThresholdPx = 24,
  downThresholdPx = 4,
  enabled = true,
  onUp,
  onDown,
}: UseScrollDirectionOptions = {}): void {
  const onUpRef = useRef(onUp);
  const onDownRef = useRef(onDown);
  const upThresholdRef = useRef(upThresholdPx);
  const downThresholdRef = useRef(downThresholdPx);
  onUpRef.current = onUp;
  onDownRef.current = onDown;
  upThresholdRef.current = upThresholdPx;
  downThresholdRef.current = downThresholdPx;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // Clamp negative scrollY so iOS Safari rubber-band overscroll at the top
    // of the page (which makes scrollY go negative on pull) doesn't get
    // counted as upward scroll and fire spurious onUp callbacks.
    const readScrollY = () => Math.max(0, window.scrollY);

    let lastY = readScrollY();
    let upAccum = 0;
    let downAccum = 0;
    let raf: number | null = null;

    const evaluate = () => {
      raf = null;
      const currentY = readScrollY();
      const delta = currentY - lastY;
      lastY = currentY;
      if (delta === 0) return;

      if (delta > 0) {
        upAccum = 0;
        downAccum += delta;
        if (downAccum >= downThresholdRef.current) {
          downAccum = 0;
          onDownRef.current?.();
        }
      } else {
        downAccum = 0;
        upAccum += -delta;
        if (upAccum >= upThresholdRef.current) {
          upAccum = 0;
          onUpRef.current?.();
        }
      }
    };

    const onScroll = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(evaluate);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf != null) {
        window.cancelAnimationFrame(raf);
        raf = null;
      }
    };
  }, [enabled]);
}
