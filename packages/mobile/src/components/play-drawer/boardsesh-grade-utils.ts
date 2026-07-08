// Pure view-model builders for the play drawer's "Boardsesh grade" section.
//
// The section leads with the CROSS-BOARD CORRECTION: what this board's crowd
// calls a climb (its community grade at the current angle) versus what it climbs
// everywhere (the nightly data-science Boardsesh grade). These helpers turn the
// grade floats (on the shared difficulty scale, where 10 = 4a/V0 and one unit is
// one Font letter step) into a display model: which confidence tier to show, the
// formatted labels + colours, whether the grade is cross-board (universal), and
// the magnitude + direction of the correction.
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

// Compact status markers for the collapsed-header teaser. Not user-facing
// prose (glyphs, not words), so they stay out of i18n.
const TEASER_ARROW = '▸';
const TEASER_CONFIRMED = '✓';
const TEASER_PROVISIONAL = '~';

/** MoonBoard has no standardized community grade in our feed yet. */
export function isMoonBoard(boardName: string): boolean {
  return boardName.toLowerCase() === 'moonboard';
}

export type BoardseshGradeView =
  | { kind: 'moonboard' }
  | {
      kind: 'setterOnly';
      /** The setter's grade to show muted ("Setter's call: V4"), or null when there's none at all. */
      grade: RenderedGrade | null;
      count: number;
    }
  | {
      kind: 'confirmed';
      /** True = cross-board (universal) grade; false = scoped to this board only. */
      universal: boolean;
      grade: RenderedGrade;
      /** Raw primary grade float (drives the correction delta + chart reference line). */
      gradeValue: number;
      gradeLow: number | null;
      gradeHigh: number | null;
      count: number;
      computedAt: string;
    }
  | {
      kind: 'provisional';
      universal: boolean;
      grade: RenderedGrade;
      gradeValue: number;
      /** Non-null when the low/high bounds round to different grades ("V5–V6"). */
      rangeLabel: string | null;
      gradeLow: number | null;
      gradeHigh: number | null;
      count: number;
      computedAt: string;
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
  if (!grade) return { kind: 'setterOnly', grade: null, count: 0 };

  // Prefer the cross-board universal grade; fall back to the board-local grade
  // (small boards that never earn a universal number).
  const universal = grade.universalGrade != null;
  const primary = grade.universalGrade ?? grade.localGrade;
  const rendered = primary != null ? renderDifficulty(primary, gradeFormat) : null;

  if (grade.confidence === 'setter_only' || primary == null || !rendered) {
    return { kind: 'setterOnly', grade: rendered, count: grade.ascensionistCount };
  }

  if (grade.confidence === 'confirmed') {
    return {
      kind: 'confirmed',
      universal,
      grade: rendered,
      gradeValue: primary,
      gradeLow: grade.gradeLow,
      gradeHigh: grade.gradeHigh,
      count: grade.ascensionistCount,
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
    universal,
    grade: rendered,
    gradeValue: primary,
    rangeLabel,
    gradeLow: grade.gradeLow,
    gradeHigh: grade.gradeHigh,
    count: grade.ascensionistCount,
    computedAt: grade.computedAt,
  };
}

/** Direction of the crowd grade relative to the cross-board Boardsesh grade. */
export type DeltaDirection = 'easier' | 'stiffer' | 'equal';

export type BoardseshCorrection = {
  /** The crowd's community grade at this angle ("This board"). */
  crowd: RenderedGrade;
  /** Correction magnitude in V-grade steps (a multiple of ½), 0 when they agree. */
  steps: number;
  /** Magnitude label for the pill ("½", "1", "1½"), or null when the grades agree. */
  label: string | null;
  /** Which way the crowd sits relative to everywhere: `easier` = everywhere is
   *  easier than the crowd calls it (crowd over-grades); `stiffer` = the reverse. */
  direction: DeltaDirection;
};

/**
 * Render a ½-step magnitude as a compact label: 0.5 → "½", 1 → "1", 1.5 → "1½".
 * Returns null for a zero (or negative) magnitude.
 */
export function formatHalfGrades(steps: number): string | null {
  if (steps <= 0) return null;
  const whole = Math.floor(steps);
  const hasHalf = steps - whole >= 0.5;
  const label = `${whole > 0 ? whole : ''}${hasHalf ? '½' : ''}`;
  return label.length ? label : null;
}

/**
 * The correction between the crowd's grade at this angle and the cross-board
 * Boardsesh grade. Both are rounded to a difficulty id first — one id step is
 * one Font letter, i.e. half a V-grade — so the magnitude reads in ½-grades and
 * "they agree" means they round to the same bucket. Null when there's no crowd
 * grade at this angle (nothing to correct against).
 */
export function buildCorrection(
  crowdDifficulty: number | null,
  boardseshValue: number,
  gradeFormat: GradeDisplayFormat,
): BoardseshCorrection | null {
  if (crowdDifficulty == null) return null;
  const crowd = renderDifficulty(crowdDifficulty, gradeFormat);
  if (!crowd) return null;

  const idDelta = clampDifficultyId(crowdDifficulty) - clampDifficultyId(boardseshValue);
  const steps = Math.abs(idDelta) / 2;
  const direction: DeltaDirection = idDelta > 0 ? 'easier' : idDelta < 0 ? 'stiffer' : 'equal';
  return { crowd, steps, label: formatHalfGrades(steps), direction };
}

/**
 * Collapsed-header teaser for the Boardsesh grade section — a compact plain
 * string leading with the correction. When a crowd label is supplied and it
 * differs from the confirmed cross-board grade, shows "{crowd} ▸ {bs} ✓"; a
 * confident cross-board grade alone reads "{bs} ✓"; provisional "{bs} ~";
 * local-only "{bs} · {localWord}". Null for moonboard / setter-only.
 */
export function buildBoardseshGradeSummary(
  view: BoardseshGradeView,
  options?: { crowdLabel?: string | null; localWord?: string },
): string | null {
  const crowdLabel = options?.crowdLabel ?? null;
  const localWord = options?.localWord;

  switch (view.kind) {
    case 'confirmed': {
      const bs = view.grade.label;
      if (!view.universal) return localWord ? `${bs} · ${localWord}` : bs;
      if (crowdLabel && crowdLabel !== bs) return `${crowdLabel} ${TEASER_ARROW} ${bs} ${TEASER_CONFIRMED}`;
      return `${bs} ${TEASER_CONFIRMED}`;
    }
    case 'provisional': {
      const bs = view.rangeLabel ?? view.grade.label;
      if (!view.universal && localWord) return `${bs} · ${localWord}`;
      return `${bs} ${TEASER_PROVISIONAL}`;
    }
    default:
      return null;
  }
}
