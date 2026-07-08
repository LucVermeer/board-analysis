// Pure view-model builder for the play drawer's "Boardsesh grade" section.
// Turns the nightly data-science grade (floats on the shared difficulty scale,
// where 10 = 4a/V0 and one unit is one Font letter step) into a display model:
// which confidence tier to show, the formatted grade label + colour, and whether
// the grade is cross-board (universal) or scoped to this board only (local).
//
// Kept free of React so it unit-tests without a renderer.
import type { GradeDisplayFormat } from '@boardsesh/play-view';
import type { BoardseshGrade } from '@boardsesh/graphql/operations';
import {
  renderDifficulty,
  clampDifficultyId,
  GRADE_BY_ID,
  MIN_DIFFICULTY_ID,
  MAX_DIFFICULTY_ID,
  type RenderedGrade,
} from '../../lib/boardsesh-grade-display';

// Re-exported for existing/back-compat call sites — the difficulty-scale
// primitives now live in lib/boardsesh-grade-display.ts (a lib must not
// import from components, so they moved there; this file, a component-tree
// helper, imports them like any other consumer).
export { renderDifficulty, clampDifficultyId, GRADE_BY_ID, MIN_DIFFICULTY_ID, MAX_DIFFICULTY_ID, type RenderedGrade };

/** MoonBoard has no standardized community grade in our feed yet. */
export function isMoonBoard(boardName: string): boolean {
  return boardName.toLowerCase() === 'moonboard';
}

/** `'universal'` = one grade across every board; `'local'` = this board only. */
export type GradeScope = 'universal' | 'local';

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
