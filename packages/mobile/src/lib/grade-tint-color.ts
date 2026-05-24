import { getGradeColor } from '@boardsesh/board-constants/grade-colors';

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

function hexToHue(hex: string): number {
  return hexToHSL(hex).h;
}

/**
 * Get a subtle HSL tint color derived from a climb's grade color.
 * Ported from packages/web/app/lib/grade-colors.ts
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
