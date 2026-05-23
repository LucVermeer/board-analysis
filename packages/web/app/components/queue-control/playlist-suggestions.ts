import type { BoardDetails, Climb } from '@/app/lib/types';
import type { ClimbQueue, ClimbQueueItem, PlaylistSuggestionSource } from './types';
import { canAddClimbToBoard } from '@/app/lib/board-compatibility';

// Re-export pure playlist suggestion functions from the shared package.
export {
  mergeUniquePlaylistClimbs,
  playlistSuggestionSourceMatches,
  getPlaylistSuggestedClimbs,
  pruneSuggestedQueueItemsAfterCurrent,
  insertQueueItemAfterCurrent,
  getPlaylistPeekQueueItemUuid,
  isPlaylistPeekQueueItemUuid,
} from '@boardsesh/queue';

import { mergeUniquePlaylistClimbs } from '@boardsesh/queue';

// Web-specific functions that depend on BoardDetails / canAddClimbToBoard stay here.

export function getQueueBoardKey(boardDetails: BoardDetails): string {
  const setIds = Array.isArray(boardDetails.set_ids) ? boardDetails.set_ids.join(',') : String(boardDetails.set_ids);
  return `${boardDetails.board_name}:${boardDetails.layout_id}:${boardDetails.size_id}:${setIds}`;
}

export function createPlaylistSuggestionSource({
  playlistUuid,
  activatedClimb,
  climbs,
  boardDetails,
}: {
  playlistUuid: string;
  activatedClimb: Climb;
  climbs: Climb[];
  boardDetails: BoardDetails;
}): PlaylistSuggestionSource {
  const climbableClimbs = (mergeUniquePlaylistClimbs(activatedClimb, climbs) as Climb[]).filter(
    (climb) => climb.uuid === activatedClimb.uuid || canAddClimbToBoard(climb, boardDetails).ok,
  );

  return {
    playlistUuid,
    activatedClimbUuid: activatedClimb.uuid,
    boardKey: getQueueBoardKey(boardDetails),
    climbs: climbableClimbs,
  };
}
