import type { BoardDetails, Climb } from '@/app/lib/types';
import type { ClimbQueue, ClimbQueueItem, PlaylistSuggestionSource } from './types';
import { canAddClimbToBoard } from '@/app/lib/board-compatibility';

export function getQueueBoardKey(boardDetails: BoardDetails): string {
  const setIds = Array.isArray(boardDetails.set_ids) ? boardDetails.set_ids.join(',') : String(boardDetails.set_ids);
  return `${boardDetails.board_name}:${boardDetails.layout_id}:${boardDetails.size_id}:${setIds}`;
}

export function mergeUniquePlaylistClimbs(activatedClimb: Climb, climbs: Climb[]): Climb[] {
  const seen = new Set<string>();
  const merged: Climb[] = [];
  let includesActivatedClimb = false;

  for (const climb of climbs) {
    if (seen.has(climb.uuid)) continue;
    if (climb.uuid === activatedClimb.uuid) {
      includesActivatedClimb = true;
    }
    seen.add(climb.uuid);
    merged.push(climb);
  }

  if (!includesActivatedClimb) {
    merged.push(activatedClimb);
  }

  return merged;
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
  const climbableClimbs = mergeUniquePlaylistClimbs(activatedClimb, climbs).filter(
    (climb) => climb.uuid === activatedClimb.uuid || canAddClimbToBoard(climb, boardDetails).ok,
  );

  return {
    playlistUuid,
    activatedClimbUuid: activatedClimb.uuid,
    boardKey: getQueueBoardKey(boardDetails),
    climbs: climbableClimbs,
  };
}

export function playlistSuggestionSourceMatches(
  current: PlaylistSuggestionSource | null,
  next: PlaylistSuggestionSource,
): boolean {
  return (
    current?.playlistUuid === next.playlistUuid &&
    current?.activatedClimbUuid === next.activatedClimbUuid &&
    current?.boardKey === next.boardKey
  );
}

export function getPlaylistSuggestedClimbs(source: PlaylistSuggestionSource | null, queue: ClimbQueue): Climb[] {
  if (!source) return [];

  const activatedIndex = source.climbs.findIndex((climb) => climb.uuid === source.activatedClimbUuid);
  if (activatedIndex === -1) return [];
  const startIndex = activatedIndex + 1;
  const queuedClimbUuids = new Set(queue.map((item) => item.climb?.uuid).filter((uuid): uuid is string => !!uuid));
  const seen = new Set<string>();
  const suggestions: Climb[] = [];

  for (const climb of source.climbs.slice(startIndex)) {
    if (queuedClimbUuids.has(climb.uuid) || seen.has(climb.uuid)) continue;
    seen.add(climb.uuid);
    suggestions.push(climb);
  }

  return suggestions;
}

export function pruneSuggestedQueueItemsAfterCurrent(queue: ClimbQueue, currentItem: ClimbQueueItem): ClimbQueue {
  const currentIndex = queue.findIndex((queueItem) => queueItem.uuid === currentItem.uuid);
  if (currentIndex === -1) {
    return queue;
  }

  return [
    ...queue.slice(0, currentIndex + 1),
    ...queue.slice(currentIndex + 1).filter((queueItem) => !queueItem.suggested),
  ];
}

export function insertQueueItemAfterCurrent(
  queue: ClimbQueue,
  currentItem: ClimbQueueItem | null,
  item: ClimbQueueItem,
): ClimbQueue {
  if (queue.some((queueItem) => queueItem.uuid === item.uuid)) return queue;

  const currentIndex = currentItem ? queue.findIndex((queueItem) => queueItem.uuid === currentItem.uuid) : -1;
  if (currentIndex === -1) return [...queue, item];
  return [...queue.slice(0, currentIndex + 1), item, ...queue.slice(currentIndex + 1)];
}

export function getPlaylistPeekQueueItemUuid(climbUuid: string): string {
  return `playlist-peek:${climbUuid}`;
}

export function isPlaylistPeekQueueItemUuid(queueItemUuid: string): boolean {
  return queueItemUuid.startsWith('playlist-peek:');
}
