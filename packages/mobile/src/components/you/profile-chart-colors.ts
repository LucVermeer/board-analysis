import { V_GRADE_COLORS, FONT_GRADE_COLORS } from '@boardsesh/board-constants/grade-colors';
import { brandColors, withAlpha } from '../../theme/colors';

// Mobile color resolution for the renderer-agnostic chart data emitted by
// @boardsesh/profile-stats. Mirrors the web adapter's palette so the two
// platforms read the same. Charts never import these from web.

// Layout palette — same soft, muted hsla values the web stats charts use,
// keyed by `${boardType}-${layoutId}`.
const layoutColors: Record<string, string> = {
  'kilter-1': 'hsla(190, 55%, 52%, 0.7)',
  'kilter-8': 'hsla(160, 40%, 50%, 0.7)',
  'tension-9': 'hsla(350, 50%, 58%, 0.7)',
  'tension-10': 'hsla(20, 55%, 58%, 0.7)',
  'tension-11': 'hsla(42, 50%, 55%, 0.7)',
  'moonboard-1': 'hsla(270, 40%, 58%, 0.7)',
  'moonboard-2': 'hsla(250, 40%, 55%, 0.7)',
  'moonboard-3': 'hsla(290, 35%, 55%, 0.7)',
  'moonboard-4': 'hsla(230, 40%, 58%, 0.7)',
  'moonboard-5': 'hsla(210, 45%, 55%, 0.7)',
  'decoy-2': 'hsla(100, 40%, 52%, 0.7)',
  'touchstone-1': 'hsla(30, 50%, 55%, 0.7)',
  'grasshopper-1': 'hsla(75, 45%, 50%, 0.7)',
};

/** Color for a `${boardType}-${layoutId}` layout key. */
export function layoutChartColor(layoutKey: string): string {
  if (layoutColors[layoutKey]) return layoutColors[layoutKey];
  return layoutKey.startsWith('kilter') ? 'rgba(6, 182, 212, 0.5)' : 'rgba(239, 68, 68, 0.5)';
}

/**
 * Softened grade color for chart bars — preserves hue but lowers saturation
 * and raises lightness for a cohesive, muted look. Mirrors web's
 * `getGradeChartColor`. `gradeKey` is a grade label (e.g. "V6" or "6A").
 */
export function gradeChartColor(gradeKey: string): string {
  const normalized = gradeKey.replace(/\+$/, '');
  const hexColor = V_GRADE_COLORS[normalized] ?? FONT_GRADE_COLORS[gradeKey.toLowerCase()];
  if (!hexColor) return 'hsla(0, 0%, 78%, 0.7)';

  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  const hDeg = Math.round(h * 360);
  const sMuted = Math.min(Math.round(s * 100), 50);
  const lMuted = Math.max(Math.round(l * 100), 48);
  return `hsla(${hDeg}, ${sMuted}%, ${lMuted}%, 0.75)`;
}

/** Flash = sage success, Redpoint = brick error — matches the web stats chart. */
export function flashRedpointColor(seriesKey: 'flash' | 'redpoint'): string {
  return seriesKey === 'flash' ? withAlpha(brandColors.success, 0.85) : withAlpha(brandColors.error, 0.85);
}

/** Solid grade color (un-softened) for badges/chips. */
export function gradeBadgeColor(gradeLabel: string | null | undefined): string {
  if (!gradeLabel) return '#808080';
  const normalized = gradeLabel.replace(/\+$/, '');
  return V_GRADE_COLORS[normalized] ?? FONT_GRADE_COLORS[gradeLabel.toLowerCase()] ?? '#808080';
}
