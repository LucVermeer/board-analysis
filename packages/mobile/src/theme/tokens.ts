/**
 * Cross-platform design tokens.
 *
 * Color tokens have moved to ./colors.ts
 * Typography tokens have moved to ./typography.ts
 * Animation tokens have moved to ./animations.ts
 */

import { Platform } from 'react-native';
import { iosSystemColors } from './ios-colors';
import { withAlpha } from './colors';

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const shadowColor = '#000' as const;

export const shadows = {
  xs: {
    shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  sm: {
    shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  xl: {
    shadowColor,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
} as const;

export const opacity = {
  subtle: 0.7,
  disabled: 0.5,
} as const;

/**
 * Glass material strength, expressed as the iOS<26 `blurAmount` fallback. Native
 * Liquid Glass (`GlassView`) only exposes `regular`/`clear`, so the material
 * split lives on the blur path: actionable FABs read with the frostier `regular`
 * material; informational text capsules use the lighter `thin` material so the
 * content behind them stays legible.
 */
export const glassMaterial = {
  regular: 20,
  thin: 13,
} as const;

/**
 * Floating-overlay tokens. Intentionally fixed across light/dark — these are
 * for chips/buttons that overlay arbitrary content (board images, photos) and
 * need stable contrast regardless of the user's color scheme.
 */
export const overlays = {
  scrim: 'rgba(0, 0, 0, 0.6)',
  onScrim: '#FFFFFF',
} as const;

/** Shared bottom-sheet handle and background styles used by QueueSheet, AngleSelectorSheet, and PlayDrawer. */
export const sheetStyles = {
  indicator: {
    backgroundColor: `${iosSystemColors.systemGray}4D`,
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  background: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
} as const;

/**
 * Material 3 building blocks used ONLY on the Android branches of the three
 * Material-ized surfaces (bottom navigation, bottom sheets, buttons). Kept
 * deliberately small — this is a hybrid skin over the existing components, not a
 * parallel Material design system.
 */
export const material = {
  /** M3 pressed state-layer opacity, used to tint ripples. */
  pressedStateLayer: 0.12,
  navBar: {
    /** Tonal pill behind the focused tab's icon. */
    activeIndicatorWidth: 56,
    activeIndicatorHeight: 32,
    activeIndicatorRadius: 16,
    /** Resting elevation of the solid Android nav surface. */
    surfaceElevation: 3,
  },
  sheet: {
    /** M3 bottom-sheet top corner radius (iOS keeps borderRadius.xl = 16). */
    cornerRadius: 28,
    handleWidth: 32,
    handleHeight: 4,
    /** M3 scrim opacity (iOS keeps 0.4). */
    scrimOpacity: 0.32,
  },
  button: {
    /** M3 filled/tonal/outlined/text corner radius (iOS keeps 10). */
    radius: 20,
  },
} as const;

/**
 * Builds a Pressable `android_ripple` config from a base colour at the M3
 * pressed state-layer opacity. `borderless` suits circular targets (tab items,
 * icon buttons); bounded ripple suits filled/outlined surfaces. Android-only —
 * iOS uses the reanimated scale/opacity path in PressableSurface.
 */
export function androidRipple(color: string, borderless = false): { color: string; borderless: boolean } {
  return { color: withAlpha(color, material.pressedStateLayer), borderless };
}

/**
 * Bottom-sheet chrome resolved per platform: Android gets the Material 3 metrics
 * (28dp corners, slimmer handle, lighter scrim), iOS keeps the softer existing
 * look. Shared by Sheet and ModalSheet so the two never drift.
 */
export const sheetAndroid = {
  scrimOpacity: Platform.OS === 'android' ? material.sheet.scrimOpacity : 0.4,
  handleStyle:
    Platform.OS === 'android'
      ? { ...sheetStyles.indicator, width: material.sheet.handleWidth, height: material.sheet.handleHeight }
      : sheetStyles.indicator,
  corners:
    Platform.OS === 'android'
      ? { borderTopLeftRadius: material.sheet.cornerRadius, borderTopRightRadius: material.sheet.cornerRadius }
      : null,
} as const;

export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
export type Shadows = typeof shadows;
export type Opacity = typeof opacity;
export type Material = typeof material;
