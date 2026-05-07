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
 * Thresholds, callbacks, and `enabled` are all stored in refs so the listener
 * attaches once on mount and never re-attaches. That matters because the
 * parent's `enabled` is typically derived from layout state — flipping it
 * mid-scroll (e.g. a drawer opening while the user is two thirds of the
 * way to the threshold) used to wipe the accumulator and force them to
 * re-scroll the full distance. Now the gate is checked inside the scroll
 * handler: when disabled we still track lastY so motion that happens while
 * disabled isn't credited, but the accumulator is preserved across enable
 * toggles so a paused scroll can resume from where it left off.
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
  const enabledRef = useRef(enabled);
  onUpRef.current = onUp;
  onDownRef.current = onDown;
  upThresholdRef.current = upThresholdPx;
  downThresholdRef.current = downThresholdPx;
  enabledRef.current = enabled;

  useEffect(() => {
    if (typeof window === 'undefined') return;

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
      // While disabled, keep lastY in sync (so motion during the disabled
      // window isn't credited on re-enable) but leave the accumulators
      // alone — paused scrolls resume from where they left off.
      if (!enabledRef.current) return;
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
  }, []);
}
