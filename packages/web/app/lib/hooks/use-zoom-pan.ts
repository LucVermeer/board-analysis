'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useGesture } from '@use-gesture/react';
import { MIN_SCALE, MAX_SCALE, ZOOM_THRESHOLD } from '@boardsesh/play-view';

type UseZoomPanOptions = {
  enabled?: boolean;
};

type UseZoomPanReturn = {
  containerRef: React.RefCallback<HTMLDivElement>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  isZoomed: boolean;
  resetZoom: () => void;
  /** Spread onto the gesture target element: <div {...gestureHandlers} /> */
  gestureHandlers: ReturnType<ReturnType<typeof useGesture>>;
};

export function useZoomPan({ enabled = true }: UseZoomPanOptions = {}): UseZoomPanReturn {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const containerElRef = useRef<HTMLDivElement | null>(null);

  // Gesture state stored in refs to avoid re-renders during gestures
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const isTransitioningRef = useRef(false);

  // Only this boolean triggers re-renders (on gesture end)
  const [isZoomed, setIsZoomed] = useState(false);

  const clampTranslate = useCallback((x: number, y: number, scale: number) => {
    const el = containerElRef.current;
    if (!el || scale <= 1) return { x: 0, y: 0 };

    const rect = el.getBoundingClientRect();
    const maxX = (rect.width * (scale - 1)) / 2;
    const maxY = (rect.height * (scale - 1)) / 2;

    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const applyTransform = useCallback((scale: number, x: number, y: number, animate = false) => {
    const el = contentRef.current;
    if (!el) return;

    const newTransform = scale === 1 ? '' : `scale(${scale}) translate(${x / scale}px, ${y / scale}px)`;

    if (animate && el.style.transform !== newTransform) {
      isTransitioningRef.current = true;
      el.style.transition = 'transform 0.25s ease-out';
      const onEnd = () => {
        el.style.transition = '';
        isTransitioningRef.current = false;
        el.removeEventListener('transitionend', onEnd);
      };
      el.addEventListener('transitionend', onEnd, { once: true });
      // Fallback: clear transitioning state if transitionend doesn't fire
      // (e.g. element hidden by parent animation, browser skips transition)
      setTimeout(() => {
        isTransitioningRef.current = false;
      }, 300);
    } else {
      el.style.transition = '';
      isTransitioningRef.current = false;
    }

    el.style.transform = newTransform;
  }, []);

  const resetZoom = useCallback(() => {
    scaleRef.current = 1;
    translateRef.current = { x: 0, y: 0 };
    applyTransform(1, 0, 0, true);
    setIsZoomed(false);
  }, [applyTransform]);

  // Pinch origin tracking
  const pinchOriginRef = useRef({ x: 0, y: 0 });

  // Use React prop-based binding (NOT target) so that event handlers fire
  // via React's synthetic event system, which doesn't block native scroll.
  // The browser handles single-finger vertical scroll natively via
  // touch-action: pan-y, and the gesture library detects pinch-to-zoom
  // from the same pointer events without interference.
  const bind = useGesture(
    {
      onPinch: ({ origin: [ox, oy], first, offset: [s], memo }) => {
        if (!enabled || isTransitioningRef.current) return memo;

        if (first) {
          const rect = containerElRef.current?.getBoundingClientRect();
          if (rect) {
            // Store pinch origin relative to center of container
            pinchOriginRef.current = {
              x: ox - rect.left - rect.width / 2,
              y: oy - rect.top - rect.height / 2,
            };
          }
          return {
            startScale: scaleRef.current,
            startX: translateRef.current.x,
            startY: translateRef.current.y,
          };
        }

        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

        // Adjust translate to zoom toward pinch origin
        const prevScale = scaleRef.current;
        if (memo && prevScale !== newScale) {
          const scaleDiff = newScale - prevScale;
          const adjustX = -(pinchOriginRef.current.x * scaleDiff) / newScale;
          const adjustY = -(pinchOriginRef.current.y * scaleDiff) / newScale;
          translateRef.current.x += adjustX;
          translateRef.current.y += adjustY;
        }

        scaleRef.current = newScale;
        const clamped = clampTranslate(translateRef.current.x, translateRef.current.y, newScale);
        translateRef.current = clamped;

        applyTransform(newScale, clamped.x, clamped.y);
        return memo;
      },
      onPinchEnd: () => {
        if (!enabled) return;
        const scale = scaleRef.current;

        // Snap back to 1 if barely zoomed
        if (scale < ZOOM_THRESHOLD) {
          scaleRef.current = 1;
          translateRef.current = { x: 0, y: 0 };
          applyTransform(1, 0, 0, true);
          setIsZoomed(false);
        } else {
          setIsZoomed(true);
        }
      },
      onDrag: ({ delta: [dx, dy], pinching, first, tap }) => {
        if (!enabled || pinching || tap || isTransitioningRef.current) return;
        // Only allow drag-to-pan when zoomed
        if (scaleRef.current <= 1) return;

        if (first) {
          // Prevent text selection during drag
          const el = contentRef.current;
          if (el) el.style.userSelect = 'none';
        }

        const newX = translateRef.current.x + dx;
        const newY = translateRef.current.y + dy;
        const clamped = clampTranslate(newX, newY, scaleRef.current);
        translateRef.current = clamped;

        applyTransform(scaleRef.current, clamped.x, clamped.y);
      },
      onDragEnd: () => {
        const el = contentRef.current;
        if (el) el.style.userSelect = '';
      },
      onWheel: ({ event, delta: [, dy], ctrlKey, pinching }) => {
        if (!enabled || pinching || isTransitioningRef.current) return;
        // Only handle ctrl+wheel (trackpad pinch or ctrl+scroll)
        if (!ctrlKey) return;

        event.preventDefault();

        const scaleFactor = 1 - dy * 0.01;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleRef.current * scaleFactor));

        // Zoom toward cursor position
        const rect = containerElRef.current?.getBoundingClientRect();
        if (rect) {
          const cursorX = event.clientX - rect.left - rect.width / 2;
          const cursorY = event.clientY - rect.top - rect.height / 2;
          const scaleDiff = newScale - scaleRef.current;
          translateRef.current.x -= (cursorX * scaleDiff) / newScale;
          translateRef.current.y -= (cursorY * scaleDiff) / newScale;
        }

        scaleRef.current = newScale;
        const clamped = clampTranslate(translateRef.current.x, translateRef.current.y, newScale);
        translateRef.current = clamped;

        applyTransform(newScale, clamped.x, clamped.y);
        setIsZoomed(newScale > ZOOM_THRESHOLD);
      },
    },
    {
      pinch: {
        scaleBounds: { min: MIN_SCALE, max: MAX_SCALE },
        from: () => [scaleRef.current, 0],
      },
      drag: {
        enabled: isZoomed,
        from: () => [translateRef.current.x, translateRef.current.y],
        filterTaps: true,
        pointer: { capture: false },
      },
      wheel: {
        eventOptions: { passive: false },
      },
    },
  );

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerElRef.current = node;
  }, []);

  // Reset when disabled
  useEffect(() => {
    if (!enabled && scaleRef.current !== 1) {
      scaleRef.current = 1;
      translateRef.current = { x: 0, y: 0 };
      applyTransform(1, 0, 0);
      setIsZoomed(false);
    }
  }, [enabled, applyTransform]);

  return {
    containerRef,
    contentRef,
    isZoomed,
    resetZoom,
    gestureHandlers: bind(),
  };
}
