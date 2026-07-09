// Pure tier → view-model logic for the Boardsesh-grade section. Kept free of
// React and i18n so the copy decision can be unit-tested in isolation and the
// content component stays a thin renderer.
import type { BoardseshGrade } from '@boardsesh/graphql/operations/boardsesh-grade';

/** Confidence tiers emitted by the nightly grading job. */
export const BOARDSESH_GRADE_CONFIDENCE = {
  confirmed: 'confirmed',
  provisional: 'provisional',
  setterOnly: 'setter_only',
} as const;

/**
 * A resolved grade view.
 * - `scope: 'local'` — board-native community estimate. This is the primary
 *   climb-detail grade because users are looking at a climb on its own board.
 * - `scope: 'universal'` — fallback for malformed/future rows where a universal
 *   grade exists without a local grade.
 * - `comparisonDifficultyId` — optional Tension-anchored comparison grade. It is
 *   secondary context, not the primary grade.
 * - `hasUniversalGrade` — true when the row is standardized across boards even
 *   if the rounded universal value matches the primary grade and needs no extra
 *   comparison line.
 * `difficultyId` is the primary grade rounded to the nearest Aurora difficulty id.
 */
export type BoardseshGradeView =
  | { kind: 'moonboard' }
  | { kind: 'setterOnly' }
  | {
      kind: 'confirmed';
      scope: 'universal' | 'local';
      difficultyId: number;
      comparisonDifficultyId: number | null;
      hasUniversalGrade: boolean;
      ascensionistCount: number;
    }
  | {
      kind: 'provisional';
      scope: 'universal' | 'local';
      difficultyId: number;
      lowDifficultyId: number;
      highDifficultyId: number;
      comparisonDifficultyId: number | null;
      hasUniversalGrade: boolean;
      /** True when the rounded low/high bounds differ — render as a range. */
      isRange: boolean;
      ascensionistCount: number;
    };

export type DeriveBoardseshGradeViewInput = {
  boardName: string | null | undefined;
  grade: BoardseshGrade | null;
};

/** MoonBoard has no community grade feed yet, so it never gets a computed grade. */
export function isMoonBoard(boardName: string | null | undefined): boolean {
  return (boardName ?? '').toLowerCase() === 'moonboard';
}

function roundToDifficultyId(value: number): number {
  return Math.round(value);
}

function rangeForPrimaryGrade(
  grade: BoardseshGrade,
  primary: number,
  scope: 'local' | 'universal',
): { low: number | null; high: number | null } {
  if (grade.gradeLow == null || grade.gradeHigh == null) {
    return { low: null, high: null };
  }
  if (scope === 'local' && grade.universalGrade != null) {
    const universalOffset = grade.universalGrade - primary;
    return { low: grade.gradeLow - universalOffset, high: grade.gradeHigh - universalOffset };
  }
  return { low: grade.gradeLow, high: grade.gradeHigh };
}

function comparisonDifficultyIdFor(grade: BoardseshGrade, primaryDifficultyId: number): number | null {
  if (grade.universalGrade == null || grade.localGrade == null) {
    return null;
  }
  const universalDifficultyId = roundToDifficultyId(grade.universalGrade);
  return universalDifficultyId === primaryDifficultyId ? null : universalDifficultyId;
}

/**
 * Decide which Boardsesh-grade tier to render and pre-round every float to a
 * difficulty id. Returns `null` only when there is genuinely nothing to show —
 * callers treat that identically to `setterOnly`.
 */
export function deriveBoardseshGradeView({ boardName, grade }: DeriveBoardseshGradeViewInput): BoardseshGradeView {
  if (isMoonBoard(boardName)) {
    return { kind: 'moonboard' };
  }

  // No row yet, or the model hasn't left the setter's call.
  if (!grade || grade.confidence === BOARDSESH_GRADE_CONFIDENCE.setterOnly) {
    return { kind: 'setterOnly' };
  }

  const primary = grade.localGrade ?? grade.universalGrade;
  if (primary == null) {
    return { kind: 'setterOnly' };
  }
  const scope: 'universal' | 'local' = grade.localGrade != null ? 'local' : 'universal';
  const difficultyId = roundToDifficultyId(primary);
  const comparisonDifficultyId = scope === 'local' ? comparisonDifficultyIdFor(grade, difficultyId) : null;
  const hasUniversalGrade = grade.universalGrade != null;

  if (grade.confidence === BOARDSESH_GRADE_CONFIDENCE.provisional) {
    const range = rangeForPrimaryGrade(grade, primary, scope);
    const lowDifficultyId = range.low != null ? roundToDifficultyId(range.low) : difficultyId;
    const highDifficultyId = range.high != null ? roundToDifficultyId(range.high) : difficultyId;
    return {
      kind: 'provisional',
      scope,
      difficultyId,
      lowDifficultyId,
      highDifficultyId,
      comparisonDifficultyId,
      hasUniversalGrade,
      isRange: lowDifficultyId !== highDifficultyId,
      ascensionistCount: grade.ascensionistCount,
    };
  }

  // Anything else with a grade present is treated as confirmed.
  return {
    kind: 'confirmed',
    scope,
    difficultyId,
    comparisonDifficultyId,
    hasUniversalGrade,
    ascensionistCount: grade.ascensionistCount,
  };
}
