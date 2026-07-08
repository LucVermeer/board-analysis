// Pure view-model builder for the play drawer's "Boardsesh grade" section.
// Turns the nightly data-science grade (floats on the shared difficulty scale,
// where 10 = 4a/V0 and one unit is one Font letter step) into a display model:
// which confidence tier to show, the formatted grade label + colour, and whether
// the grade is cross-board (universal) or scoped to this board only (local).
//
// Kept free of React so it unit-tests without a renderer.
import type { GradeDisplayFormat } from '@boardsesh/play-view';
import type { BoardseshGrade, BoardseshGradeAtAngle } from '@boardsesh/graphql/operations';
import {
  renderDifficulty,
  clampDifficultyId,
  GRADE_BY_ID,
  MIN_DIFFICULTY_ID,
  MAX_DIFFICULTY_ID,
  type RenderedGrade,
} from '../../lib/boardsesh-grade-display';
import type { AngleGradeBar } from './community-utils';

// Re-exported for existing/back-compat call sites — the difficulty-scale
// primitives now live in lib/boardsesh-grade-display.ts (a lib must not
// import from components, so they moved there; this file, a component-tree
// helper, imports them like any other consumer).
export { renderDifficulty, clampDifficultyId, GRADE_BY_ID, MIN_DIFFICULTY_ID, MAX_DIFFICULTY_ID, type RenderedGrade };

// Locale-neutral math symbol shown after a provisional single grade to signal it
// may still shift by a grade. Not user-facing prose, so it stays out of i18n.
export const APPROX_SYMBOL = '±';

/** MoonBoard has no standardized community grade in our feed yet. */
export function isMoonBoard(boardName: string): boolean {
  return boardName.toLowerCase() === 'moonboard';
}

/** `'universal'` = one grade across every board; `'local'` = this board only. */
export type GradeScope = 'universal' | 'local';

export type BoardseshGradeView =
  | { kind: 'moonboard' }
  | { kind: 'setterOnly' }
  | {
      kind: 'confirmed';
      scope: GradeScope;
      grade: RenderedGrade;
      count: number;
      /** The board-local grade ("On this board: V4"), shown alongside a universal
       *  headline only when it rounds to a different label than the primary grade. */
      localSecondary: RenderedGrade | null;
      computedAt: string;
    }
  | {
      kind: 'provisional';
      scope: GradeScope;
      grade: RenderedGrade;
      /** Non-null when the low/high bounds round to different grades ("V5–V6"). */
      rangeLabel: string | null;
      count: number;
      localSecondary: RenderedGrade | null;
      computedAt: string;
    };

/** The label a bound rounds to, used to decide whether a range spans two grades. */
function boundLabel(value: number, gradeFormat: GradeDisplayFormat): string | null {
  return renderDifficulty(value, gradeFormat)?.label ?? null;
}

/**
 * The board-local grade line ("On this board: V4"), or null when it wouldn't
 * add information: the headline is already board-local, there's no local
 * grade, or it rounds to the same label as the universal headline.
 */
function buildLocalSecondary(
  scope: GradeScope,
  grade: BoardseshGrade,
  primaryLabel: string,
  gradeFormat: GradeDisplayFormat,
): RenderedGrade | null {
  if (scope !== 'universal' || grade.localGrade == null) return null;
  const rendered = renderDifficulty(grade.localGrade, gradeFormat);
  if (!rendered || rendered.label === primaryLabel) return null;
  return rendered;
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

  const localSecondary = buildLocalSecondary(scope, grade, rendered.label, gradeFormat);

  if (grade.confidence === 'confirmed') {
    return {
      kind: 'confirmed',
      scope,
      grade: rendered,
      count: grade.ascensionistCount,
      localSecondary,
      computedAt: grade.computedAt,
    };
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

  return {
    kind: 'provisional',
    scope,
    grade: rendered,
    rangeLabel,
    count: grade.ascensionistCount,
    localSecondary,
    computedAt: grade.computedAt,
  };
}

/**
 * Collapsed-header summary for the Boardsesh grade section: just the label
 * (or range) with no metadata, or null when there's nothing headline-worthy
 * yet (moonboard / setter-only).
 */
export function buildBoardseshGradeSummary(view: BoardseshGradeView): string | null {
  switch (view.kind) {
    case 'confirmed':
      return view.grade.label;
    case 'provisional':
      return view.rangeLabel ?? `${view.grade.label} ${APPROX_SYMBOL}`;
    default:
      return null;
  }
}

/**
 * Per-angle bars for the Boardsesh-grade-by-angle chart, built from the
 * plural `useBoardseshGradesForAngles` rows. Prefers each row's universal
 * grade, falling back to its local grade; skips angles with no usable
 * grade and setter-only rows (no Boardsesh-branded setter numbers). Sorted
 * ascending by angle, matching the Community chart's convention.
 */
export function buildBoardseshAngleGradeBars(
  rows: BoardseshGradeAtAngle[],
  gradeFormat: GradeDisplayFormat,
): AngleGradeBar[] {
  const bars: AngleGradeBar[] = [];
  for (const row of rows) {
    if (row.confidence === 'setter_only') continue;
    const primary = row.universalGrade ?? row.localGrade;
    if (primary == null) continue;
    const rendered = renderDifficulty(primary, gradeFormat);
    if (!rendered) continue;
    bars.push({ angle: row.angle, difficulty: primary, gradeName: rendered.label, sends: row.ascensionistCount });
  }
  return bars.sort((a, b) => a.angle - b.angle);
}
