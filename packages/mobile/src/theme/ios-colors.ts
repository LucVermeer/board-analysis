import { Platform } from 'react-native';
import { brandColors } from './colors';

/**
 * The interactive-accent blue. iOS keeps Apple's #007AFF; Android resolves it to
 * the brand tint so the active tab, links, and "edit / copy / open" affordances
 * read as Boardsesh maroon rather than an out-of-place iOS blue. This is the one
 * value in `iosSystemColors` that genuinely leaks an iOS aesthetic onto Android
 * (it's used as a *tint*, not a fixed status colour); resolving it here fixes
 * every static (StyleSheet / default-prop) consumer at once without a wide
 * per-file refactor. Every other value below is intentionally identical across
 * platforms — iOS system reds/greens/grays read fine on Android too.
 */
const ACCENT_TINT = Platform.OS === 'android' ? brandColors.tint : '#007AFF';

/**
 * iOS system color constants for use in contexts where PlatformColor
 * is unavailable (animated styles, default props, StyleSheet.create).
 *
 * These are the standard light-mode hex values from Apple's Human
 * Interface Guidelines. For dark-mode adaptivity, use PlatformColor
 * via the theme provider; these constants are for static / non-adaptive
 * usage only.
 */
export const iosSystemColors = {
  /** iOS systemRed — destructive actions, badges */
  systemRed: '#FF3B30',
  /** iOS systemGreen — success, positive indicators */
  systemGreen: '#34C759',
  /** iOS systemYellow — caution, moderate indicators */
  systemYellow: '#FFCC00',
  /** Interactive accent — iOS systemBlue (#007AFF); brand maroon on Android. */
  systemBlue: ACCENT_TINT,
  /** iOS systemOrange — moderate warnings, attempted indicators */
  systemOrange: '#FF9500',
  /** iOS systemGray — secondary text, inactive tint */
  systemGray: '#8E8E93',
  /** iOS systemGray4 — chevrons, light chrome */
  systemGray4: '#C7C7CC',
  /** iOS separator color (light mode) */
  separator: 'rgba(60, 60, 67, 0.29)',
  /** Star/rating gold */
  starGold: '#FFB800',
  /** Pure white — text on colored backgrounds */
  white: '#FFFFFF',
  /** Pure black — text on light/yellow backgrounds where white wouldn't pass contrast (e.g. flash badge on systemYellow) */
  black: '#000000',
} as const;

/**
 * Dark-mode specific iOS system colors for contexts that need
 * manual dark/light switching (e.g. BlurTabBar).
 */
export const iosDarkColors = {
  /** iOS systemBackground (dark) — base screen background */
  background: '#000000',
  /** iOS secondarySystemBackground (dark) */
  secondaryBackground: '#1C1C1E',
  /** iOS systemGroupedBackground (dark) */
  groupedBackground: '#000000',
  /** iOS systemGray (dark) — inactive tint */
  systemGray: '#8E8E93',
  /** iOS separator (dark) */
  separator: '#38383A',
} as const;

/**
 * Light-mode specific iOS system colors for contexts that need
 * manual dark/light switching (e.g. BlurTabBar).
 */
export const iosLightColors = {
  /** iOS secondarySystemBackground (light) */
  secondaryBackground: '#F2F2F7',
  /** iOS systemGray2 — inactive tint (light) */
  inactiveGray: '#999999',
  /** iOS separator (light) */
  separator: '#C6C6C8',
} as const;

/** Neutral gray for image placeholder backgrounds */
export const neutralGray = '#E5E7EB';
