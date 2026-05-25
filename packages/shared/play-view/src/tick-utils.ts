/**
 * Minimal climb shape needed for prior-history detection.
 * Keeps the function framework-agnostic.
 */
export type ClimbWithAscents = {
  uuid: string;
  userAscents?: number | null;
  userAttempts?: number | null;
};

/**
 * Minimal logbook entry shape for prior-history lookup.
 */
export type LogbookEntryLike = {
  climb_uuid: string;
};

/**
 * Decide whether the user has any prior history for a climb.
 * Checks server-side counts first (available immediately), then
 * falls back to logbook array scan.
 */
export function hasPriorHistoryForClimb(climb: ClimbWithAscents, logbook: LogbookEntryLike[]): boolean {
  const ascents = climb.userAscents;
  const attempts = climb.userAttempts;
  if (ascents != null || attempts != null) {
    return (ascents ?? 0) + (attempts ?? 0) > 0;
  }
  return logbook.some((entry) => entry.climb_uuid === climb.uuid);
}

/**
 * Determine whether an ascent is a flash or a send.
 * Flash = first attempt on a climb with no prior history.
 */
export function computeTickType(hasPriorHistory: boolean, attemptCount: number): 'flash' | 'send' {
  return !hasPriorHistory && attemptCount === 1 ? 'flash' : 'send';
}
