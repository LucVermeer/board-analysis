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
 */
export function useScrollDirection({
  upThresholdPx = 24,
  downThresholdPx = 4,
  enabled = true,
  onUp,
  onDown,
}: UseScrollDirectionOptions = {}): void {
  // Latest callbacks captured in refs so the listener always invokes the
  // current closure without resubscribing on every render.
  const onUpRef = useRef(onUp);
  const onDownRef = useRef(onDown);
  onUpRef.current = onUp;
  onDownRef.current = onDown;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let lastY = window.scrollY;
    let upAccum = 0;
    let downAccum = 0;
    let raf: number | null = null;

    const evaluate = () => {
      raf = null;
      const currentY = window.scrollY;
      const delta = currentY - lastY;
      lastY = currentY;
      if (delta === 0) return;

      if (delta > 0) {
        upAccum = 0;
        downAccum += delta;
        if (downAccum >= downThresholdPx) {
          downAccum = 0;
          onDownRef.current?.();
        }
      } else {
        downAccum = 0;
        upAccum += -delta;
        if (upAccum >= upThresholdPx) {
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
  }, [enabled, upThresholdPx, downThresholdPx]);
}
