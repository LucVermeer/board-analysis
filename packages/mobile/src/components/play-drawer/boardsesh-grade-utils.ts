// Pure view-model builder for the play drawer's "Boardsesh grade" section.
// Turns the nightly data-science grade (floats on the shared difficulty scale,
// where 10 = 4a/V0 and one unit is one Font letter step) into a display model:
// which confidence tier to show, the formatted grade label + colour, and whether
// the grade is cross-board (universal) or scoped to this board only (local).
//
// Kept free of React so it unit-tests without a renderer.
import { formatGrade, type GradeDisplayFormat } from '@boardsesh/play-view';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { BOULDER_GRADES, type BoulderGrade } from '@boardsesh/board-constants/boulder-grade-mapping';
import type { BoardseshGrade } from '@boardsesh/graphql/operations';

const GRADE_BY_ID = new Map<number, BoulderGrade>(BOULDER_GRADES.map((grade) => [grade.difficulty_id, grade]));

// The difficulty scale the data-science grade shares with Aurora's ids.
const MIN_DIFFICULTY_ID = BOULDER_GRADES[0].difficulty_id;
const MAX_DIFFICULTY_ID = BOULDER_GRADES[BOULDER_GRADES.length - 1].difficulty_id;

/** MoonBoard has no standardized community grade in our feed yet. */
export function isMoonBoard(boardName: string): boolean {
  return boardName.toLowerCase() === 'moonboard';
}

/** `'universal'` = one grade across every board; `'local'` = this board only. */
export type GradeScope = 'universal' | 'local';

export type RenderedGrade = {
  /** Formatted label per the user's grade preference (e.g. "V5", "6c"). */
  label: string;
  /** Hex colour for the grade, consistent with the play drawer header. */
  color: string;
};

export type BoardseshGradeView =
  | { kind: 'moonboard' }
  | { kind: 'setterOnly' }
  | { kind: 'confirmed'; scope: GradeScope; grade: RenderedGrade; count: number }
  | {
      kind: 'provisional';
      scope: GradeScope;
      grade: RenderedGrade;
      /** Non-null when the low/high bounds round to different grades ("V5–V6"). */
      rangeLabel: string | null;
      count: number;
    };

function clampDifficultyId(value: number): number {
  return Math.min(MAX_DIFFICULTY_ID, Math.max(MIN_DIFFICULTY_ID, Math.round(value)));
}

/** Round a float difficulty to the nearest grade and render its label + colour. */
export function renderDifficulty(value: number, gradeFormat: GradeDisplayFormat): RenderedGrade | null {
  const grade = GRADE_BY_ID.get(clampDifficultyId(value));
  if (!grade) return null;
  return {
    label: formatGrade(grade.difficulty_name, gradeFormat) ?? grade.v_grade,
    color: getGradeColor(grade.difficulty_name) ?? DEFAULT_GRADE_COLOR,
  };
}

/** The label a bound rounds to, used to decide whether a range spans two grades. */
function boundLabel(value: number, gradeFormat: GradeDisplayFormat): string | null {
  return renderDifficulty(value, gradeFormat)?.label ?? null;
}

/**
 * Build the display model for a climb+angle's Boardsesh grade.
 * `grade` is null when the nightly job has no row yet (falls back to setter-only).
 */
export function buildBoardseshGradeView(
  boardName: string,
  grade: BoardseshGrade | null,
  gradeFormat: GradeDisplayFormat,
): BoardseshGradeView {
  if (isMoonBoard(boardName)) return { kind: 'moonboard' };
  if (!grade) return { kind: 'setterOnly' };

  // Prefer the cross-board universal grade; fall back to the board-local grade
  // (small boards that never earn a universal number).
  const scope: GradeScope = grade.universalGrade != null ? 'universal' : 'local';
  const primary = grade.universalGrade ?? grade.localGrade;

  if (grade.confidence === 'setter_only' || primary == null) {
    return { kind: 'setterOnly' };
  }

  const rendered = renderDifficulty(primary, gradeFormat);
  if (!rendered) return { kind: 'setterOnly' };

  if (grade.confidence === 'confirmed') {
    return { kind: 'confirmed', scope, grade: rendered, count: grade.ascensionistCount };
  }

  // Everything else ('provisional', or any unexpected value) reads as still
  // settling. Show a range only when the bounds round to two different grades.
  let rangeLabel: string | null = null;
  if (grade.gradeLow != null && grade.gradeHigh != null) {
    const lowLabel = boundLabel(grade.gradeLow, gradeFormat);
    const highLabel = boundLabel(grade.gradeHigh, gradeFormat);
    if (lowLabel && highLabel && lowLabel !== highLabel) {
      rangeLabel = `${lowLabel}–${highLabel}`;
    }
  }

  return { kind: 'provisional', scope, grade: rendered, rangeLabel, count: grade.ascensionistCount };
}
