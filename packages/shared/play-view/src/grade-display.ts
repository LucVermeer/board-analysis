import { getGradeColor } from '@boardsesh/board-constants/grade-colors';

// Re-export for convenience
export { getGradeColor };

/**
 * Convert a hex color to HSL components.
 * @returns Object with h (0-360), s (0-1), l (0-1)
 */
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h: h * 360, s, l };
}

/**
 * Extract hue from a hex color.
 */
function hexToHue(hex: string): number {
  return hexToHSL(hex).h;
}

/**
 * Get a semi-transparent version of a grade color for backgrounds.
 * @param color - Hex color string
 * @param opacity - Opacity value between 0 and 1
 * @returns RGBA color string
 */
export function getGradeColorWithOpacity(color: string | undefined, opacity: number = 0.7): string {
  if (!color) return 'rgba(200, 200, 200, 0.7)';

  // Convert hex to RGB
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Determine if a color is light or dark (for text contrast).
 * @param hexColor - Hex color string
 * @returns true if the color is light (should use dark text)
 */
export function isLightColor(hexColor: string): boolean {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

/**
 * Get appropriate text color (black or white) for a grade color background.
 * @param gradeColor - Hex color string of the background
 * @returns 'black' or 'white' hex string, or 'inherit' for undefined input
 */
export function getGradeTextColor(gradeColor: string | undefined): string {
  if (!gradeColor) return 'inherit';
  return isLightColor(gradeColor) ? '#000000' : '#FFFFFF';
}

/**
 * Get a subtle HSL tint color derived from a climb's grade color.
 * @param difficulty - Difficulty string like "6a/V3" or "V5"
 * @param variant - 'default' for queue bar (30% sat, 88% light), 'light' for list items (20% sat, 94% light)
 * @param darkMode - When true, uses lower lightness values suitable for dark backgrounds
 * @returns HSL color string or undefined if no grade color found
 */
export function getGradeTintColor(
  difficulty: string | null | undefined,
  variant: 'default' | 'light' | 'session' = 'default',
  darkMode?: boolean,
): string | undefined {
  const color = getGradeColor(difficulty);
  if (!color) return undefined;

  const hue = Math.round(hexToHue(color));

  if (darkMode) {
    if (variant === 'light') {
      return `hsl(${hue}, 25%, 22%)`;
    }
    if (variant === 'session') {
      return `hsla(${hue}, 40%, 14%, 0.85)`;
    }
    return `hsla(${hue}, 35%, 28%, 0.6)`;
  }

  if (variant === 'light') {
    return `hsl(${hue}, 20%, 94%)`;
  }
  if (variant === 'session') {
    return `hsl(${hue}, 35%, 82%)`;
  }
  return `hsl(${hue}, 30%, 88%)`;
}
