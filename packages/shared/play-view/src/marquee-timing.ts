// Shared timing for the "scroll a long climb name back and forth" marquee, used
// by both the web climb chrome (CSS keyframes, `marquee-text.tsx`) and the mobile
// now-playing bar (Reanimated, `MarqueeText.tsx`). Keeping the speed + duration
// math here means both platforms scroll at the same pace from one source.

/** Scroll speed. Slow enough to read a long name without it feeling frantic. */
export const MARQUEE_PIXELS_PER_SECOND = 30;
/** A short name that barely overflows still gets a calm, readable cycle. */
export const MARQUEE_MIN_DURATION_S = 8;
/** A very long name never crawls for more than this. */
export const MARQUEE_MAX_DURATION_S = 24;

/**
 * Full back-and-forth cycle length (seconds) for a name overflowing its slot by
 * `overflowPx`. The `+ 6` reserves time for the end-of-travel dwells so the cycle
 * isn't all motion. Returns 0 when nothing overflows (no animation needed).
 */
export function computeMarqueeDurationS(overflowPx: number): number {
  if (overflowPx <= 0) return 0;
  return Math.min(MARQUEE_MAX_DURATION_S, Math.max(MARQUEE_MIN_DURATION_S, overflowPx / MARQUEE_PIXELS_PER_SECOND + 6));
}
