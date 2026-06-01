'use client';

import React, { useMemo } from 'react';
import type { LogbookEntry } from '@boardsesh/board-react';
import { AscentStatusIcon } from '@/app/components/ascent-status/ascent-status-icon';
import {
  normalizeAscentStatus,
  pickHighestAscentStatus,
  type AscentStatusValue,
} from '@/app/components/ascent-status/ascent-status-utils';
import type { ClimbUuid } from '@/app/lib/types';
import { useOptionalBoardProvider } from '../board-provider/board-provider-context';

const EMPTY_LOGBOOK: LogbookEntry[] = [];

type AscentStatusProps = {
  climbUuid: ClimbUuid;
  /** Currently selected board angle. Badges only reflect ticks logged at this angle
   *  so a send at 30° doesn't display when the user is viewing the climb at 50°. */
  angle: number;
  fontSize?: number;
  /** Class for the badge wrapper (e.g. positioning on a thumbnail).
   *  For mirroring boards this is applied to each individual badge. */
  className?: string;
  /** Additional class for the mirrored ascent badge (bottom-left positioning). */
  mirroredClassName?: string;
};

function getHighestStatus(entries: LogbookEntry[]): AscentStatusValue | null {
  return pickHighestAscentStatus(
    entries.map((entry) =>
      normalizeAscentStatus({
        status: entry.status,
        isAscent: entry.is_ascent,
        tries: entry.tries,
      }),
    ),
  );
}

export const AscentStatus = ({ climbUuid, angle, fontSize, className, mirroredClassName }: AscentStatusProps) => {
  const boardProvider = useOptionalBoardProvider();
  const logbook = boardProvider?.logbook ?? EMPTY_LOGBOOK;
  const boardName = boardProvider?.boardName ?? 'kilter';

  const ascentsForClimb = useMemo(
    () => logbook.filter((ascent) => ascent.climb_uuid === climbUuid && ascent.angle === angle),
    [logbook, climbUuid, angle],
  );

  const overallStatus = useMemo(() => getHighestStatus(ascentsForClimb), [ascentsForClimb]);
  const regularStatus = useMemo(
    () => getHighestStatus(ascentsForClimb.filter(({ is_mirror }) => !is_mirror)),
    [ascentsForClimb],
  );
  const mirroredStatus = useMemo(
    () => getHighestStatus(ascentsForClimb.filter(({ is_mirror }) => is_mirror)),
    [ascentsForClimb],
  );
  const supportsMirroring = boardName === 'tension' || boardName === 'decoy';

  if (supportsMirroring) {
    if (!regularStatus && !mirroredStatus) return null;

    return (
      <>
        {regularStatus && (
          <AscentStatusIcon
            status={regularStatus}
            variant="badge"
            fontSize={fontSize}
            className={className}
            testId="ascent-badge"
          />
        )}
        {mirroredStatus && (
          <AscentStatusIcon
            status={mirroredStatus}
            variant="badge"
            fontSize={fontSize}
            className={mirroredClassName ?? className}
            mirrored
            testId="ascent-badge-mirrored"
          />
        )}
      </>
    );
  }

  if (!overallStatus) return null;

  return (
    <AscentStatusIcon
      status={overallStatus}
      variant="badge"
      fontSize={fontSize}
      className={className}
      testId="ascent-badge"
    />
  );
};
