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
