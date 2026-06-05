import type { ClimbStatsHistoryEntry } from '@boardsesh/graphql/operations';
import { formatGrade, type GradeDisplayFormat } from '@boardsesh/play-view';
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
        ? (formatGrade(grade.difficulty_name, gradeFormat) ?? grade.v_grade)
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

export type AngleStats = {
  /** Formatted grade label (e.g. "V6"), or null when this angle has no stats. */
  gradeName: string | null;
  /** Grade colour, for tinting the grade label. */
  color: string;
  /** Average quality rating (stars), or null when unrated. */
  quality: number | null;
  /** Ascensionist count (sends) at this angle. */
  sends: number;
};

// Latest snapshot per angle → grade + quality + sends, for the angle selector's
// per-angle row stats. Same latest-per-angle logic as buildAngleGradeBars, but
// keyed by angle and carrying quality/sends too. Angles with no difficulty
// snapshot still appear (gradeName null) so their quality/sends can show.
export function buildAngleStatsMap(
  history: ClimbStatsHistoryEntry[] | undefined,
  gradeFormat: GradeDisplayFormat,
): Map<number, AngleStats> {
  const result = new Map<number, AngleStats>();
  if (!history) return result;

  const latestByAngle = new Map<number, ClimbStatsHistoryEntry>();
  for (const entry of history) {
    const existing = latestByAngle.get(entry.angle);
    if (!existing || new Date(entry.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      latestByAngle.set(entry.angle, entry);
    }
  }

  for (const [angle, entry] of latestByAngle) {
    const difficulty = entry.displayDifficulty ?? entry.difficultyAverage;
    const grade = difficulty == null ? undefined : GRADE_BY_ID.get(Math.round(difficulty));
    let gradeName: string | null = null;
    if (grade) {
      gradeName = formatGrade(grade.difficulty_name, gradeFormat) ?? grade.v_grade;
    } else if (difficulty != null) {
      gradeName = String(Math.round(difficulty));
    }
    result.set(angle, {
      gradeName,
      color: getGradeColor(grade?.difficulty_name) ?? DEFAULT_GRADE_COLOR,
      quality: entry.qualityAverage,
      sends: entry.ascensionistCount ?? 0,
    });
  }

  return result;
}
