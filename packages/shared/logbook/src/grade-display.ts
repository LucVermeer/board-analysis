/**
 * Decides how a logbook row shows its grade. The big grade is the climber's
 * effective grade (their logged grade, or the consensus when they didn't grade
 * it). The community consensus is surfaced as a small secondary only when it
 * disagrees with the logged grade, and an ungraded row's grade is marked as
 * consensus-sourced so it's clear it's the crowd's, not the climber's.
 *
 * Pure difficulty-id comparison so the row's display branches stay unit-testable
 * and web can reuse it when it gets the same dual-grade display; the grade-label
 * formatting (which needs the platform's grade-format hook) lives in the row.
 */
export function deriveLogbookGradeDisplay(
  loggedDifficulty: number | null | undefined,
  consensusDifficulty: number | null | undefined,
): { showConsensusSecondary: boolean; gradeIsConsensus: boolean } {
  const hasLogged = loggedDifficulty != null;
  return {
    showConsensusSecondary: hasLogged && consensusDifficulty != null && consensusDifficulty !== loggedDifficulty,
    gradeIsConsensus: !hasLogged && consensusDifficulty != null,
  };
}

/**
 * Direction of the climber's grade relative to the consensus, for the arrow on
 * the row's consensus sub-line: 'up' = you graded it harder than the crowd,
 * 'down' = softer. Only meaningful when `showConsensusSecondary` is true —
 * returns null when either grade is missing or they agree. Difficulty ids are
 * ordinal (higher id = harder), the same assumption the grade range filters make.
 */
export function consensusDeltaDirection(
  loggedDifficulty: number | null | undefined,
  consensusDifficulty: number | null | undefined,
): 'up' | 'down' | null {
  if (loggedDifficulty == null || consensusDifficulty == null) return null;
  if (loggedDifficulty === consensusDifficulty) return null;
  return loggedDifficulty > consensusDifficulty ? 'up' : 'down';
}
