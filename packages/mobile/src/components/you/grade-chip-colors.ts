import { gradeBadgeColor } from './profile-chart-colors';
import { withAlpha } from '../../theme/colors';

/**
 * Foreground + tinted-background pair for a grade-hued pill (GradeChip, the
 * trophy MetricChip). The foreground is the grade's own vivid colour from
 * board-constants (via `gradeBadgeColor`, so combined labels like "6B+/V4"
 * still resolve); the background is that hue at 16% so the chip reads as a soft
 * wash of the grade colour rather than a solid block. Scheme-agnostic on
 * purpose — grade hues are fixed brand-of-grade colours, not theme tones.
 */
export function gradeChipColors(grade: string | null | undefined): { fg: string; bg: string } {
  const fg = gradeBadgeColor(grade);
  return { fg, bg: withAlpha(fg, 0.16) };
}
