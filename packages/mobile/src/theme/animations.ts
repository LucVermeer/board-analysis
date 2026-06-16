/**
 * Spring animation presets for react-native-reanimated's withSpring().
 *
 * Usage:
 *   import { springs } from '@/theme/animations';
 *   withSpring(targetValue, springs.snappy);
 */

export const springs = {
  /** Fast, crisp response for UI controls (toggles, switches, tabs). */
  snappy: { damping: 20, stiffness: 300, mass: 0.7 },

  /** Standard interactive feedback (dragging, swiping, pressing). */
  interactive: { damping: 20, stiffness: 250, mass: 1.0 },

  /** Slow, smooth transitions (sheet presentations, layout changes). */
  gentle: { damping: 15, stiffness: 150, mass: 1.0 },

  /** Playful overshoot (success states, celebrations). */
  bouncy: { damping: 10, stiffness: 200, mass: 0.7 },
} as const;

/**
 * Timing presets for simple opacity/fade animations with withTiming().
 *
 * Usage:
 *   import { timing } from '@/theme/animations';
 *   withTiming(targetValue, { duration: timing.fast });
 */
export const timing = {
  /** Near-instant feedback (50ms). */
  instant: 50,

  /** Quick transitions like fades and highlights (150ms). */
  fast: 150,

  /** Standard duration for most transitions (250ms). */
  normal: 250,

  /** Slower transitions for complex layout shifts (350ms). */
  slow: 350,
} as const;

export type SpringPreset = keyof typeof springs;
export type TimingPreset = keyof typeof timing;

/**
 * Material 3 easing curves as raw cubic-bezier control points (NOT
 * `Easing.bezier(...)` — this module stays reanimated-free so it's safe to import
 * from `makeThemeMock` and other non-RN contexts; the curve is constructed at the
 * call site via `theme/motion-config.ts`). `emphasized` is a two-part spline in the
 * M3 spec that no single cubic-bezier captures exactly — approximated here.
 */
export const m3Easing = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.2, 0, 0, 1],
  decelerate: [0, 0, 0, 1],
  accelerate: [0.3, 0, 1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** Material 3 standard durations (ms): utility motions short, hero motions medium+. */
export const m3Duration = {
  short: 200, // M3 short4 — small utility transitions
  medium: 350, // M3 medium3 — standard component/layout transitions
  long: 500, // M3 long2 — large/hero transitions
} as const;

/**
 * A variant-resolved timing config: a duration, plus (Material only) an M3 easing
 * curve. Pure DATA — `Easing.bezier` is built from `easingBezier` at the call site
 * (`timingFor`), so this stays importable anywhere. Liquid Glass omits the curve and
 * keeps reanimated's default ease, preserving its feel; only the durations are
 * shared, mapped to each variant's prior values.
 */
export type MotionConfig = {
  duration: number;
  easingBezier?: readonly [number, number, number, number];
};

export type Motion = {
  /** Utility transitions (fades, small moves). */
  standard: MotionConfig;
  /** Hero / emphasized transitions (sheet/FAB moves, larger layout shifts). */
  emphasized: MotionConfig;
};

/**
 * Per-variant motion. Material uses M3 easing curves + standard durations; Liquid
 * Glass keeps its prior `timing` durations (no easing override) so its feel is
 * unchanged. Springs (press/gesture feedback) stay separate — these tokens cover
 * the `withTiming` transitions the two variants share.
 */
export const motionByVariant = {
  liquidGlass: {
    standard: { duration: timing.fast },
    emphasized: { duration: timing.normal },
  },
  material: {
    standard: { duration: m3Duration.short, easingBezier: m3Easing.standard },
    emphasized: { duration: m3Duration.medium, easingBezier: m3Easing.emphasized },
  },
} as const satisfies Record<'liquidGlass' | 'material', Motion>;
