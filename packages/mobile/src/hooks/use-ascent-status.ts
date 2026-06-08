import { useMemo } from 'react';
import { useOptionalBoardProvider } from '@boardsesh/board-react';
import { normalizeAscentStatus, pickHighestAscentStatus, type AscentStatusValue } from '../lib/ascent-status-utils';

/**
 * The user's highest recorded ascent status (flash / send / attempt) for a climb
 * at a given angle, read from the denormalised logbook via `BoardProvider`.
 * Returns null when there are no ticks at this angle, or outside a BoardProvider.
 * Shared by the thumbnail `AscentStatusBadge` and the climb-row scan-line marker.
 */
export function useAscentStatus(climbUuid: string, angle: number, isMirror?: boolean): AscentStatusValue | null {
  const board = useOptionalBoardProvider();
  return useMemo<AscentStatusValue | null>(() => {
    if (!board) return null;
    const entries = board.logbook.filter(
      (entry) =>
        entry.climb_uuid === climbUuid &&
        entry.angle === angle &&
        (isMirror === undefined || entry.is_mirror === isMirror),
    );
    if (entries.length === 0) return null;
    return pickHighestAscentStatus(
      entries.map((entry) =>
        normalizeAscentStatus({ status: entry.status, isAscent: entry.is_ascent, tries: entry.tries }),
      ),
    );
  }, [board, climbUuid, angle, isMirror]);
}
