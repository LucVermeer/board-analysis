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
  /** iOS systemBlue — default tint, links */
  systemBlue: '#007AFF',
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
} as const;

/**
 * Dark-mode specific iOS system colors for contexts that need
 * manual dark/light switching (e.g. BlurTabBar).
 */
export const iosDarkColors = {
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
