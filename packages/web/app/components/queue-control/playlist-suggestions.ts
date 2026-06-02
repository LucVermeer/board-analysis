import type { BoardDetails, Climb } from '@/app/lib/types';
import type { PlaylistSuggestionSource } from './types';
import { canAddClimbToBoard } from '@/app/lib/board-compatibility';
import {
  createPlaylistSuggestionSource as createSharedPlaylistSuggestionSource,
  getQueueBoardKey as getSharedQueueBoardKey,
  type Climb as QueueClimb,
} from '@boardsesh/queue';

// Pure playlist helpers are owned by `@boardsesh/queue`; re-export them so the
// ~web call-sites importing from this module stay untouched.
export {
  mergeUniquePlaylistClimbs,
  playlistSuggestionSourceMatches,
  getPlaylistSuggestedClimbs,
  pruneSuggestedQueueItemsAfterCurrent,
  insertQueueItemAfterCurrent,
  getPlaylistPeekQueueItemUuid,
  isPlaylistPeekQueueItemUuid,
} from '@boardsesh/queue';

/**
 * Web-facing `getQueueBoardKey`: takes the web `BoardDetails` directly.
 * `BoardDetails` structurally satisfies the shared `QueueBoardKeyTarget`
 * (board_name / layout_id / size_id / set_ids), so we forward as-is.
 */
export function getQueueBoardKey(boardDetails: BoardDetails): string {
  return getSharedQueueBoardKey(boardDetails);
}

/**
 * Web-facing `createPlaylistSuggestionSource`: keeps the `{ boardDetails }`
 * signature its ~30 call-sites expect, deriving the shared builder's
 * `boardKey` + climbability predicate from web board-compatibility.
 *
 * TYPE SEAM: web's `Climb` (with `boardType`) is structurally wider than the
 * shared queue `Climb`; the runtime objects are identical, so we cast at the
 * boundary rather than re-shaping the data.
 */
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
  const source = createSharedPlaylistSuggestionSource({
    playlistUuid,
    activatedClimb: activatedClimb as unknown as QueueClimb,
    climbs: climbs as unknown as QueueClimb[],
    boardKey: getSharedQueueBoardKey(boardDetails),
    isClimbable: (climb) => canAddClimbToBoard(climb as unknown as Climb, boardDetails).ok,
  });
  return source as unknown as PlaylistSuggestionSource;
}
