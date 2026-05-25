'use client';

import { useRef, useCallback } from 'react';
import { decideSwipeDirection } from '@boardsesh/play-view';

/**
 * Hook to determine whether an in-progress swipe is horizontal or vertical.
 * Call `detect(deltaX, deltaY)` on each swiping event:
 *  - Returns `null` until movement exceeds the threshold
 *  - Returns `true` if horizontal, `false` if vertical
 *  - Once locked, the direction is sticky until `reset()` is called
 *
 * The threshold and decision rule live in @boardsesh/play-view so mobile and
 * web stay in lockstep.
 */
export function useSwipeDirection() {
  const isHorizontalRef = useRef<boolean | null>(null);

  const detect = useCallback((deltaX: number, deltaY: number): boolean | null => {
    if (isHorizontalRef.current === null) {
      const decision = decideSwipeDirection(deltaX, deltaY);
      if (decision !== null) {
        isHorizontalRef.current = decision === 'horizontal';
      }
    }
    return isHorizontalRef.current;
  }, []);

  const reset = useCallback(() => {
    isHorizontalRef.current = null;
  }, []);

  return { detect, reset, isHorizontalRef };
}
