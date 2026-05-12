'use client';
import React, { useMemo, useRef } from 'react';
import type { Climb, ParsedBoardRouteParameters, BoardDetails } from '@/app/lib/types';
import { useQueueActions, useCurrentClimb, useSearchData } from '../graphql-queue';
import ClimbsList from './climbs-list';
import { stabilizeClimbArrayRef } from './climb-list-utils';
import RecentSearchPills from '../search-drawer/recent-search-pills';
import AngleSelector from './angle-selector';

type BoardPageClimbsListProps = ParsedBoardRouteParameters & {
  boardDetails: BoardDetails;
  initialClimbs: Climb[];
  initialHasMore?: boolean;
};

const BoardPageClimbsList = ({
  boardDetails,
  initialClimbs,
  initialHasMore = false,
  board_name,
  layout_id: _layout_id,
  size_id: _size_id,
  set_ids: _set_ids,
  angle,
}: BoardPageClimbsListProps) => {
  const { currentClimb } = useCurrentClimb();
  const { climbSearchResults, hasMoreResults, hasDoneFirstFetch, isFetchingClimbs } = useSearchData();
  const { setCurrentClimb, addToQueue, fetchMoreClimbs } = useQueueActions();

  // Queue Context provider uses React Query infinite to fetch results, which can only happen clientside.
  // That data equals null at the start, so when its null we use the initialClimbs array which we
  // fill on the server side in the page component. This way the user never sees a loading state for
  // the climb list.
  // Deduplicate climbs by uuid to prevent React key warnings during hydration/re-renders
  const prevClimbsRef = useRef<Climb[]>([]);
  const climbs = useMemo(() => {
    const rawClimbs = !hasDoneFirstFetch ? initialClimbs : climbSearchResults || [];
    const seen = new Set<string>();
    const deduped = rawClimbs.filter((climb) => {
      if (seen.has(climb.uuid)) return false;
      seen.add(climb.uuid);
      return true;
    });

    // Return the previous reference when content hasn't changed to avoid
    // triggering downstream progressive rendering during SSR→client handoff.
    const stable = stabilizeClimbArrayRef(deduped, prevClimbsRef.current);
    if (stable !== deduped) return stable;

    prevClimbsRef.current = deduped;
    return deduped;
  }, [hasDoneFirstFetch, initialClimbs, climbSearchResults]);

  const headerInline = useMemo(() => <RecentSearchPills />, []);

  const angleSelectorElement = useMemo(
    () => (
      <AngleSelector
        boardName={board_name}
        boardDetails={boardDetails}
        currentAngle={angle}
        currentClimb={currentClimb}
      />
    ),
    [board_name, boardDetails, angle, currentClimb],
  );

  return (
    <ClimbsList
      boardDetails={boardDetails}
      initialImageCount={initialClimbs.length}
      climbs={climbs}
      selectedClimbUuid={currentClimb?.uuid}
      isFetching={isFetchingClimbs}
      hasMore={!hasDoneFirstFetch ? initialHasMore : hasMoreResults}
      onClimbSelect={setCurrentClimb}
      addToQueue={addToQueue}
      onLoadMore={fetchMoreClimbs}
      headerInline={headerInline}
      angleSelector={angleSelectorElement}
      showBottomSpacer
    />
  );
};

export default BoardPageClimbsList;
