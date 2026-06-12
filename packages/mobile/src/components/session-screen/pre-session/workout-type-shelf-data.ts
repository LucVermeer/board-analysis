import { DEFAULT_GRADE_COLOR, getGradeColor } from '@boardsesh/board-constants/grade-colors';
import type { PlannedClimbSlot } from '@boardsesh/playlist-generator';
import type { ColoredBar } from '../../you/profile-chart-colors';

type FormatDifficultyId = (difficultyId: number | null | undefined) => string | null;

/**
 * Collapse planned workout slots into mini grade bars. The x-axis is ordered
 * easy-to-hard by difficulty id; each bar's y value is the number of planned
 * climbs at that grade.
 */
export function buildWorkoutGradeBars(
  slots: readonly PlannedClimbSlot[],
  formatDifficultyId: FormatDifficultyId,
): ColoredBar[] | null {
  const countByGrade = new Map<number, number>();
  for (const slot of slots) {
    countByGrade.set(slot.grade, (countByGrade.get(slot.grade) ?? 0) + 1);
  }

  const bars: ColoredBar[] = Array.from(countByGrade.entries())
    .sort(([firstGrade], [secondGrade]) => firstGrade - secondGrade)
    .map(([difficultyId, count]) => {
      const label = formatDifficultyId(difficultyId) ?? String(difficultyId);
      const key = String(difficultyId);
      return {
        key,
        label,
        segments: [{ value: count, key, label, color: getGradeColor(label) ?? DEFAULT_GRADE_COLOR }],
      };
    });

  return bars.length > 0 ? bars : null;
}
