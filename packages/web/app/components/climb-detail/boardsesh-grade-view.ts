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
 * - `scope: 'universal'` — comparable across boards (universalGrade present).
 * - `scope: 'local'` — this-board-only scale (universalGrade null, localGrade
 *   present; happens on the small boards like grasshopper/decoy/soill/touchstone).
 * `difficultyId` is the primary grade rounded to the nearest Aurora difficulty id.
 */
export type BoardseshGradeView =
  | { kind: 'moonboard' }
  | { kind: 'setterOnly' }
  | {
      kind: 'confirmed';
      scope: 'universal' | 'local';
      difficultyId: number;
      ascensionistCount: number;
    }
  | {
      kind: 'provisional';
      scope: 'universal' | 'local';
      difficultyId: number;
      lowDifficultyId: number;
      highDifficultyId: number;
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

  // Primary grade: universal when comparable across boards, else this-board local.
  const primary = grade.universalGrade ?? grade.localGrade;
  if (primary == null) {
    return { kind: 'setterOnly' };
  }
  const scope: 'universal' | 'local' = grade.universalGrade != null ? 'universal' : 'local';
  const difficultyId = roundToDifficultyId(primary);

  if (grade.confidence === BOARDSESH_GRADE_CONFIDENCE.provisional) {
    const lowDifficultyId = grade.gradeLow != null ? roundToDifficultyId(grade.gradeLow) : difficultyId;
    const highDifficultyId = grade.gradeHigh != null ? roundToDifficultyId(grade.gradeHigh) : difficultyId;
    return {
      kind: 'provisional',
      scope,
      difficultyId,
      lowDifficultyId,
      highDifficultyId,
      isRange: lowDifficultyId !== highDifficultyId,
      ascensionistCount: grade.ascensionistCount,
    };
  }

  // Anything else with a grade present is treated as confirmed.
  return {
    kind: 'confirmed',
    scope,
    difficultyId,
    ascensionistCount: grade.ascensionistCount,
  };
}
