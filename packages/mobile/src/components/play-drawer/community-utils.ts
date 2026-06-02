import type { ClimbStatsHistoryEntry } from '@boardsesh/graphql/operations';
import type { GradeDisplayFormat } from '@boardsesh/play-view';
import { BOULDER_GRADES, type BoulderGrade } from '@boardsesh/board-constants/boulder-grade-mapping';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';

export type AngleGradeBar = {
  angle: number;
  /** Numeric difficulty (Aurora display difficulty) used for relative bar width. */
  difficulty: number;
  /** Formatted grade label shown at the end of the bar (e.g. "V6"). */
  gradeName: string;
  /** Grade colour for the bar fill. */
  color: string;
};

const GRADE_BY_ID = new Map<number, BoulderGrade>(BOULDER_GRADES.map((grade) => [grade.difficulty_id, grade]));

/**
 * Reduce climb stats history to one bar per board angle: the latest snapshot's
 * grade at that angle. There is no per-grade community vote data, so this shows
 * how the grade shifts with angle rather than a vote histogram.
 *
 * Difficulties outside the known grade range fall back to the rounded numeric
 * value rather than rendering a blank label.
 */
export function buildAngleGradeBars(
  history: ClimbStatsHistoryEntry[] | undefined,
  gradeFormat: GradeDisplayFormat,
): AngleGradeBar[] {
  if (!history) return [];

  const latestByAngle = new Map<number, { difficulty: number; createdAt: string }>();
  for (const entry of history) {
    const difficulty = entry.displayDifficulty ?? entry.difficultyAverage;
    if (difficulty == null) continue;
    const existing = latestByAngle.get(entry.angle);
    if (!existing || new Date(entry.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      latestByAngle.set(entry.angle, { difficulty, createdAt: entry.createdAt });
    }
  }

  return Array.from(latestByAngle.entries())
    .map(([angle, { difficulty }]) => {
      const grade = GRADE_BY_ID.get(Math.round(difficulty));
      const gradeName = grade
        ? gradeFormat === 'font'
          ? grade.font_grade.toUpperCase()
          : grade.v_grade
        : String(Math.round(difficulty));
      return {
        angle,
        difficulty,
        gradeName,
        color: getGradeColor(grade?.difficulty_name) ?? DEFAULT_GRADE_COLOR,
      };
    })
    .sort((a, b) => a.angle - b.angle);
}
