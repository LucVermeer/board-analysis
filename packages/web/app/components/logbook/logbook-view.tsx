'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import { tickTimeMs } from '@/app/lib/format-tick-time';
import { EmptyState } from '@/app/components/ui/empty-state';
import type { Climb } from '@/app/lib/types';
import { VoteSummaryProvider } from '@/app/components/social/vote-summary-context';
import { useBoardProvider } from '../board-provider/board-provider-context';
import { LogbookEntryCard } from './logbook-entry-card';

type LogbookViewProps = {
  currentClimb: Climb;
};

// Optimistic ticks live under a `temp-` UUID until the save mutation returns
// the real one — those rows must not render social affordances or be included
// in the bulk vote-summary fetch.
const isPersistedUuid = (uuid: string | undefined): uuid is string => !!uuid && !uuid.startsWith('temp-');

// Matches BulkVoteSummaryInputSchema.entityIds.max(100) on the backend. A
// request with more than 100 IDs is rejected outright, so we slice before
// handing the list to VoteSummaryProvider. Entries beyond this cap still
// render their social footer, but the current-user vote state on those
// rows won't be hydrated (VoteButton falls back to a 0 display, not an
// error).
const VOTE_SUMMARY_BATCH_LIMIT = 100;

export const LogbookView: React.FC<LogbookViewProps> = ({ currentClimb }) => {
  const { t } = useTranslation('profile');
  const { logbook, boardName } = useBoardProvider();

  const climbAscents = useMemo(
    () =>
      logbook
        .filter((ascent) => ascent.climb_uuid === currentClimb.uuid)
        .sort((a, b) => tickTimeMs(b.climbed_at) - tickTimeMs(a.climbed_at)),
    [logbook, currentClimb.uuid],
  );

  const tickUuids = useMemo(
    () =>
      climbAscents
        .map((ascent) => ascent.uuid)
        .filter(isPersistedUuid)
        // Ascents are already sorted newest-first, so the most recently
        // logged ticks (the ones most likely to be scrolled onto screen)
        // are the ones that get user-vote hydration.
        .slice(0, VOTE_SUMMARY_BATCH_LIMIT),
    [climbAscents],
  );

  const showMirrorTag = boardName === 'tension';

  if (climbAscents.length === 0) {
    return <EmptyState description={t('logbook.section.noAscentsLogged')} />;
  }

  return (
    <VoteSummaryProvider entityType="tick" entityIds={tickUuids}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {climbAscents.map((ascent) => (
          <LogbookEntryCard
            key={ascent.uuid || `${ascent.climb_uuid}-${ascent.climbed_at}`}
            entry={{
              climbedAt: ascent.climbed_at,
              angle: ascent.angle,
              isMirror: !!ascent.is_mirror,
              status: ascent.status ?? null,
              attemptCount: ascent.tries,
              quality: ascent.quality,
              comment: ascent.comment,
              tickUuid: isPersistedUuid(ascent.uuid) ? ascent.uuid : null,
              upvotes: ascent.upvotes,
              downvotes: ascent.downvotes,
              commentCount: ascent.commentCount,
            }}
            showMirrorTag={showMirrorTag}
          />
        ))}
      </Box>
    </VoteSummaryProvider>
  );
};
