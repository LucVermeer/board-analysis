'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSwipeable } from 'react-swipeable';
import { EXIT_DURATION, SNAP_BACK_DURATION, CLIP_EXIT_DURATION, ENTER_ANIMATION_DURATION } from '@boardsesh/play-view';
import { useSwipeDirection } from './use-swipe-direction';

export type UseCardSwipeNavigationOptions = {
  onSwipeNext: () => void;
  onSwipePrevious: () => void;
  canSwipeNext: boolean;
  canSwipePrevious: boolean;
  threshold?: number;
  delayNavigation?: boolean;
  enabled?: boolean;
};

export type UseCardSwipeNavigationReturn = {
  swipeHandlers: ReturnType<typeof useSwipeable>;
  swipeOffset: number;
  isAnimating: boolean;
  animationDirection: 'left' | 'right' | null;
  enterDirection: 'from-left' | 'from-right' | null;
  clearEnterAnimation: () => void;
  resetSwipe: () => void;
  /** Ref indicating the current swipe direction: true=horizontal, false=vertical, null=undecided */
  isHorizontalSwipeRef: React.RefObject<boolean | null>;
};

export function useCardSwipeNavigation({
  onSwipeNext,
  onSwipePrevious,
  canSwipeNext,
  canSwipePrevious,
  threshold = 80,
  delayNavigation = false,
  enabled = true,
}: UseCardSwipeNavigationOptions): UseCardSwipeNavigationReturn {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<'left' | 'right' | null>(null);
  const [enterDirection, setEnterDirection] = useState<'from-left' | 'from-right' | null>(null);
  const { detect: detectDirection, reset: resetDirection, isHorizontalRef } = useSwipeDirection();
  const animatingRef = useRef(false);
  // Owned-by-hook fallback so consumers don't each reimplement the
  // "clear enterDirection after ENTER_ANIMATION_DURATION" timer.
  const enterClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (enterClearTimerRef.current) clearTimeout(enterClearTimerRef.current);
    },
    [],
  );

  const resetSwipe = useCallback(() => {
    setSwipeOffset(0);
    setIsAnimating(false);
    setAnimationDirection(null);
    resetDirection();
    animatingRef.current = false;
  }, [resetDirection]);

  const clearEnterAnimation = useCallback(() => {
    if (enterClearTimerRef.current) {
      clearTimeout(enterClearTimerRef.current);
      enterClearTimerRef.current = null;
    }
    setEnterDirection(null);
    animatingRef.current = false;
  }, []);

  const triggerSwipeComplete = useCallback(
    (direction: 'left' | 'right') => {
      if (animatingRef.current) return;
      animatingRef.current = true;

      // Determine the exit offset (card slides off-screen)
      const exitOffset = direction === 'left' ? -window.innerWidth : window.innerWidth;

      setAnimationDirection(direction);
      setIsAnimating(true);
      setSwipeOffset(exitOffset);

      if (!delayNavigation) {
        // Call the navigation callback immediately (existing behavior)
        if (direction === 'left') {
          onSwipeNext();
        } else {
          onSwipePrevious();
        }

        // After exit animation, reset everything
        setTimeout(() => {
          resetSwipe();
        }, EXIT_DURATION);
      } else {
        // Delay navigation until text exits the visible clip area, then trigger enter animation.
        // Uses CLIP_EXIT_DURATION (shorter than EXIT_DURATION) because the text leaves
        // the narrow clip container much faster than the full slide-off animation.
        setTimeout(() => {
          // Navigate to new climb data
          if (direction === 'left') {
            onSwipeNext();
          } else {
            onSwipePrevious();
          }

          // Reset exit state
          setSwipeOffset(0);
          setIsAnimating(false);
          setAnimationDirection(null);
          resetDirection();
          // Set enter direction for thumbnail crossfade, and self-clear after
          // ENTER_ANIMATION_DURATION so consumers don't have to wire the timer.
          setEnterDirection(direction === 'left' ? 'from-right' : 'from-left');
          if (enterClearTimerRef.current) clearTimeout(enterClearTimerRef.current);
          enterClearTimerRef.current = setTimeout(() => {
            setEnterDirection(null);
            enterClearTimerRef.current = null;
          }, ENTER_ANIMATION_DURATION);
          // Unblock swipes immediately — peek text provides visual continuity
          animatingRef.current = false;
        }, CLIP_EXIT_DURATION);
      }
    },
    [onSwipeNext, onSwipePrevious, resetSwipe, resetDirection, delayNavigation],
  );

  const swipeHandlers = useSwipeable({
    onSwiping: (eventData) => {
      if (!enabled || animatingRef.current) return;

      const { deltaX, deltaY } = eventData;

      // Determine swipe direction on first significant movement
      const isHorizontal = detectDirection(deltaX, deltaY);
      if (isHorizontal === null) return;

      // If vertical swipe, don't interfere
      if (!isHorizontal) return;

      // Constrain swipe if we can't go in that direction
      let constrainedOffset = deltaX;
      if (deltaX < 0 && !canSwipeNext) constrainedOffset = 0;
      if (deltaX > 0 && !canSwipePrevious) constrainedOffset = 0;

      setSwipeOffset(constrainedOffset);
    },
    onSwipedLeft: (eventData) => {
      resetDirection();
      if (!enabled || animatingRef.current) return;

      if (canSwipeNext && Math.abs(eventData.deltaX) >= threshold) {
        triggerSwipeComplete('left');
      } else {
        setSwipeOffset(0);
      }
    },
    onSwipedRight: (eventData) => {
      resetDirection();
      if (!enabled || animatingRef.current) return;

      if (canSwipePrevious && Math.abs(eventData.deltaX) >= threshold) {
        triggerSwipeComplete('right');
      } else {
        setSwipeOffset(0);
      }
    },
    onTouchEndOrOnMouseUp: () => {
      resetDirection();
      if (!animatingRef.current && Math.abs(swipeOffset) < threshold) {
        setSwipeOffset(0);
      }
    },
    trackMouse: false,
    trackTouch: true,
    // preventScrollOnSwipe doesn't work with React 18's passive touch listeners.
    // Scroll prevention is handled via a native non-passive touchmove listener
    // in the component that renders the swipeable element.
    preventScrollOnSwipe: false,
  });

  return {
    swipeHandlers,
    swipeOffset,
    isAnimating,
    animationDirection,
    enterDirection,
    clearEnterAnimation,
    resetSwipe,
    isHorizontalSwipeRef: isHorizontalRef,
  };
}

export { EXIT_DURATION, SNAP_BACK_DURATION, ENTER_ANIMATION_DURATION };
