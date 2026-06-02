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

// Latest snapshot per angle → one grade bar; out-of-range difficulties show the rounded number.
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
