/**
 * Playlist suggestion utilities that are pure functions with no web-specific
 * dependencies. Functions that depend on BoardDetails or canAddClimbToBoard
 * (createPlaylistSuggestionSource, getQueueBoardKey) remain in the web app.
 */

import type { Climb } from '@boardsesh/shared-schema';
import type { ClimbQueue, ClimbQueueItem, PlaylistSuggestionSource } from './types';

/**
 * Merge a list of playlist climbs with the activated climb, deduplicating
 * by uuid and ensuring the activated climb is always included.
 */
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

/**
 * Check whether two playlist suggestion sources refer to the same playlist
 * activation (same playlist, same activated climb, same board key).
 */
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

/**
 * Return the list of climbs from a playlist suggestion source that come after
 * the activated climb and are not already in the queue.
 */
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

/**
 * After navigating to a new current item, prune suggested items that appear
 * after the current item in the queue. Non-suggested items are preserved.
 */
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

/**
 * Insert a queue item immediately after the current item.
 * If the item already exists in the queue (by uuid), returns the original array.
 * If currentItem is null or not found, appends to the end.
 */
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

/**
 * Generate a deterministic queue-item uuid for playlist peek items.
 */
export function getPlaylistPeekQueueItemUuid(climbUuid: string): string {
  return `playlist-peek:${climbUuid}`;
}

/**
 * Check whether a queue-item uuid is a playlist peek uuid.
 */
export function isPlaylistPeekQueueItemUuid(queueItemUuid: string): boolean {
  return queueItemUuid.startsWith('playlist-peek:');
}
