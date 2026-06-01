'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import BoardImageLayers from './board-image-layers';
import BoardCanvasRenderer from './board-canvas-renderer';
import { useCardSwipeNavigation, EXIT_DURATION, SNAP_BACK_DURATION } from '@/app/hooks/use-card-swipe-navigation';
import type { BoardDetails } from '@/app/lib/types';
import { useCanvasRendererReady } from '@/app/lib/board-render-worker/worker-manager';
import { useDoubleTap } from '@/app/lib/hooks/use-double-tap';
import ZoomableBoard from './zoomable-board';
import ZoomHint from './zoom-hint';
import styles from './swipe-board-carousel.module.css';

type ClimbBoardData = {
  frames: string;
  mirrored?: boolean | null;
};

export type SwipeBoardCarouselProps = {
  boardDetails: BoardDetails;
  currentClimb: ClimbBoardData;
  nextClimb?: ClimbBoardData | null;
  previousClimb?: ClimbBoardData | null;
  onSwipeNext: () => void;
  onSwipePrevious: () => void;
  canSwipeNext: boolean;
  canSwipePrevious: boolean;
  className?: string;
  boardContainerClassName?: string;
  fillContainer?: boolean;
  onDoubleTap?: () => void;
  showZoomHint?: boolean;
  isDrawerOpen?: boolean;
  overlay?: React.ReactNode;
  onZoomChange?: (zoomed: boolean) => void;
  /**
   * Key passed to ZoomableBoard's reset logic. Defaults to the current frames
   * string, but variable-speed playback should pin this to the climb UUID so
   * zoom doesn't reset on every animation tick.
   */
  zoomResetKey?: string;
};

const SwipeBoardCarousel = React.memo<SwipeBoardCarouselProps>(
  ({
    boardDetails,
    currentClimb,
    nextClimb,
    previousClimb,
    onSwipeNext,
    onSwipePrevious,
    canSwipeNext,
    canSwipePrevious,
    className,
    boardContainerClassName,
    fillContainer,
    onDoubleTap,
    showZoomHint,
    isDrawerOpen,
    overlay,
    onZoomChange: onZoomChangeProp,
    zoomResetKey,
  }) => {
    const [isZoomed, setIsZoomed] = useState(false);

    const { swipeHandlers, swipeOffset, isAnimating, animationDirection, enterDirection, isHorizontalSwipeRef } =
      useCardSwipeNavigation({
        onSwipeNext,
        onSwipePrevious,
        canSwipeNext,
        canSwipePrevious,
        threshold: 80,
        delayNavigation: true,
        enabled: !isZoomed,
      });

    const getSwipeTransition = () => {
      if (enterDirection) return 'none';
      if (isAnimating) return `transform ${EXIT_DURATION}ms ease-out`;
      if (swipeOffset === 0) return `transform ${SNAP_BACK_DURATION}ms ease`;
      return 'none';
    };

    const showPeek = swipeOffset !== 0 || isAnimating;
    const peekIsNext = animationDirection === 'left' || (animationDirection === null && swipeOffset < 0);
    const peekClimb = peekIsNext ? nextClimb : previousClimb;

    const getPeekTransform = () => {
      return peekIsNext
        ? `translateX(max(0px, calc(100% + ${swipeOffset}px)))`
        : `translateX(min(0px, calc(-100% + ${swipeOffset}px)))`;
    };

    const transition = getSwipeTransition();
    const canvasReady = useCanvasRendererReady();
    const { ref: doubleTapRef, onDoubleClick: handleDoubleTapClick } = useDoubleTap(isZoomed ? undefined : onDoubleTap);

    const handleZoomChange = useCallback(
      (zoomed: boolean) => {
        setIsZoomed(zoomed);
        onZoomChangeProp?.(zoomed);
      },
      [onZoomChangeProp],
    );

    // Prevent vertical scroll during horizontal card swipes.
    // touch-action: pan-y enables compositor-driven scroll that ignores React 18's
    // passive preventDefault(). A native non-passive listener forces the compositor
    // to wait for our decision before scrolling.
    const carouselElRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
      const el = carouselElRef.current;
      if (!el) return;
      const handler = (e: TouchEvent) => {
        if (isHorizontalSwipeRef.current === true) {
          e.preventDefault();
        }
      };
      el.addEventListener('touchmove', handler, { passive: false });
      return () => el.removeEventListener('touchmove', handler);
    }, [isHorizontalSwipeRef]);

    // Extract stable ref from swipeHandlers to avoid re-creating the callback on every render
    // eslint-disable-next-line @typescript-eslint/unbound-method -- react-swipeable ref callback, no this concern
    const swipeRef = swipeHandlers.ref;
    // Merge swipe ref, double-tap ref, and carousel ref into one callback ref
    const mergedRef = useCallback(
      (node: HTMLElement | null) => {
        carouselElRef.current = node;
        doubleTapRef(node);
        if (swipeRef) {
          // react-swipeable ref callback
          (swipeRef as React.RefCallback<HTMLElement>)(node);
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-create when ref callback changes
      [doubleTapRef, swipeRef],
    );

    const renderBoard = (climb: ClimbBoardData) => {
      if (canvasReady) {
        return (
          <BoardCanvasRenderer
            boardDetails={boardDetails}
            frames={climb.frames}
            mirrored={!!climb.mirrored}
            contain
            style={{ width: '100%', height: '100%' }}
          />
        );
      }
      return (
        <BoardImageLayers
          boardDetails={boardDetails}
          frames={climb.frames}
          mirrored={!!climb.mirrored}
          contain
          style={{ width: '100%', height: '100%' }}
        />
      );
    };

    return (
      <div
        className={`${styles.carouselContainer} ${className ?? ''}`}
        style={fillContainer ? undefined : { aspectRatio: `${boardDetails.boardWidth} / ${boardDetails.boardHeight}` }}
        {...swipeHandlers}
        ref={mergedRef}
        onDoubleClick={handleDoubleTapClick}
      >
        <div
          className={boardContainerClassName}
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition,
          }}
        >
          <ZoomableBoard onZoomChange={handleZoomChange} resetKey={zoomResetKey ?? currentClimb.frames}>
            {renderBoard(currentClimb)}
          </ZoomableBoard>
        </div>
        {overlay}
        {showZoomHint && <ZoomHint visible={!isZoomed && !!isDrawerOpen} />}
        {showPeek && peekClimb && (
          <div
            className={styles.peekBoardContainer}
            style={{
              transform: getPeekTransform(),
              transition,
            }}
          >
            {renderBoard(peekClimb)}
          </div>
        )}
      </div>
    );
  },
);
SwipeBoardCarousel.displayName = 'SwipeBoardCarousel';

export default SwipeBoardCarousel;
