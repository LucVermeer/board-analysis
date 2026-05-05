'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './marquee-text.module.css';

type MarqueeTextProps = {
  /** Slow horizontal scroll when content overflows. When false, render plain ellipsis. */
  active: boolean;
  className?: string;
  children: React.ReactNode;
};

const PIXELS_PER_SECOND = 30;
const MIN_DURATION_S = 8;
const MAX_DURATION_S = 24;
const TRAILING_BUFFER_PX = 8;

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const MarqueeText: React.FC<MarqueeTextProps> = ({ active, className, children }) => {
  const outerRef = useRef<HTMLSpanElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [overflowPx, setOverflowPx] = useState(0);

  useIsoLayoutEffect(() => {
    if (!active) {
      setOverflowPx(0);
      return;
    }
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      const overflow = inner.scrollWidth - outer.clientWidth;
      setOverflowPx(overflow > 0 ? overflow : 0);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [active, children]);

  const isScrolling = active && overflowPx > 0;
  const durationS = isScrolling
    ? Math.min(MAX_DURATION_S, Math.max(MIN_DURATION_S, overflowPx / PIXELS_PER_SECOND + 6))
    : 0;

  const innerStyle = isScrolling
    ? ({
        ['--marquee-distance' as string]: `${overflowPx + TRAILING_BUFFER_PX}px`,
        ['--marquee-duration' as string]: `${durationS}s`,
      } as React.CSSProperties)
    : undefined;

  return (
    <span ref={outerRef} className={`${styles.outer}${className ? ` ${className}` : ''}`}>
      <span ref={innerRef} className={isScrolling ? styles.innerScrolling : styles.innerStatic} style={innerStyle}>
        {children}
      </span>
    </span>
  );
};

export default MarqueeText;
