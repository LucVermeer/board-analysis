import { type TextStyle } from 'react-native';

/**
 * Apple Human Interface Guidelines type scale.
 * Uses the system font (San Francisco on iOS, Roboto on Android).
 * No custom font families — we rely on the platform default.
 *
 * Note: largeTitle, title1, and title2 use bold (700) instead of
 * HIG's default Regular (400). This is intentional for brand identity.
 */

type TypeStyle = Pick<TextStyle, 'fontSize' | 'fontWeight' | 'lineHeight'>;

export const textStyles = {
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 41,
  },
  title1: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  title2: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  title3: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 25,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  body: {
    fontSize: 17,
    fontWeight: '400',
    lineHeight: 22,
  },
  callout: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 21,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 20,
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  caption1: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  caption2: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 13,
  },
} as const satisfies Record<string, TypeStyle>;

export type TextVariant = keyof typeof textStyles;

/**
 * Max Dynamic Type multiplier for labels inside fixed-height glass chrome — the
 * queue capsule and the iOS 26 bottom-accessory / now-playing-style rows, whose
 * height is pinned to the `glassSize` ladder. The global `Text` default (1.5×)
 * clips the single-line climb name + grade against those rigid heights, so cap
 * them at 1.2× — still meaningfully larger for low-vision users, but it fits the
 * platter. Surfaces that can grow with their content keep the 1.5× default.
 */
export const CHROME_LABEL_MAX_FONT_SCALE = 1.2;
