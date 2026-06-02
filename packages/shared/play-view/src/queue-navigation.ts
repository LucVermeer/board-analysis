import type { ClimbQueueItem, ClimbQueue, PlaylistSuggestionSource } from '@boardsesh/queue';
import { getPlaylistSuggestedClimbs, getPlaylistPeekQueueItemUuid } from '@boardsesh/queue';
import type { NavigationState } from './types';

/**
 * Find the next item in the queue relative to the current climb.
 * Returns null if there is no next item.
 */
export function findNextQueueItem(
  queue: ClimbQueue,
  currentClimbQueueItem: ClimbQueueItem | null,
): ClimbQueueItem | null {
  if (queue.length === 0) return null;
  if (!currentClimbQueueItem) return queue[0];

  const currentIndex = queue.findIndex(({ uuid }) => uuid === currentClimbQueueItem.uuid);
  const nextIndex = currentIndex + 1;

  if (nextIndex < queue.length) {
    return queue[nextIndex];
  }

  return null;
}

/**
 * Find the previous item in the queue relative to the current climb.
 * Returns null if there is no previous item.
 */
export function findPreviousQueueItem(
  queue: ClimbQueue,
  currentClimbQueueItem: ClimbQueueItem | null,
): ClimbQueueItem | null {
  if (queue.length === 0 || !currentClimbQueueItem) return null;

  const currentIndex = queue.findIndex(({ uuid }) => uuid === currentClimbQueueItem.uuid);
  const prevIndex = currentIndex - 1;

  if (prevIndex >= 0) {
    return queue[prevIndex];
  }

  return null;
}

/**
 * Compute full navigation state from queue and current item.
 * Used by both web and mobile to derive action bar props.
 */
export function computeNavigationState(
  queue: ClimbQueue,
  currentClimbQueueItem: ClimbQueueItem | null,
): NavigationState {
  const nextItem = findNextQueueItem(queue, currentClimbQueueItem);
  const prevItem = findPreviousQueueItem(queue, currentClimbQueueItem);

  const currentIndex = currentClimbQueueItem ? queue.findIndex(({ uuid }) => uuid === currentClimbQueueItem.uuid) : -1;

  const remainingCount = currentIndex >= 0 ? queue.length - currentIndex - 1 : queue.length;

  return {
    canNext: nextItem !== null,
    canPrevious: prevItem !== null,
    nextItem,
    prevItem,
    remainingCount,
  };
}

/**
 * Like findNextQueueItem, but when the queue is exhausted relative to the
 * current item, fall through to the first playlist suggestion as a transient
 * "peek" item (deterministic uuid, suggested: true). Mirrors web's queue-bridge
 * `getNextClimbQueueItem` fall-through. Returns null when neither a real next
 * item nor a suggestion exists.
 *
 * Note the deliberate divergence from findNextQueueItem on an orphan current
 * (currentIndex === -1, which happens transiently between committing a peek and
 * the server echo landing): this falls through to suggestions rather than
 * snapping back to queue[0], so a rapid double-swipe keeps advancing.
 */
export function findNextQueueItemWithSuggestions(
  queue: ClimbQueue,
  currentClimbQueueItem: ClimbQueueItem | null,
  source: PlaylistSuggestionSource | null,
): ClimbQueueItem | null {
  if (currentClimbQueueItem) {
    const currentIndex = queue.findIndex(({ uuid }) => uuid === currentClimbQueueItem.uuid);
    if (currentIndex >= 0 && currentIndex < queue.length - 1) {
      return queue[currentIndex + 1];
    }
    // currentIndex === -1 (orphan current) OR at end → fall through to suggestions.
  } else if (queue.length > 0) {
    return queue[0];
  }

  const nextClimb = getPlaylistSuggestedClimbs(source, queue)[0];
  return nextClimb
    ? { climb: nextClimb, addedBy: null, uuid: getPlaylistPeekQueueItemUuid(nextClimb.uuid), suggested: true }
    : null;
}

/**
 * computeNavigationState that lights up canNext/nextItem from playlist
 * suggestions when the queue is exhausted. canPrevious/prevItem stay queue-only
 * (web has no backward suggestion fall-through). remainingCount stays
 * queue-based to match web's action-bar remaining count.
 */
export function computeNavigationStateWithSuggestions(
  queue: ClimbQueue,
  currentClimbQueueItem: ClimbQueueItem | null,
  source: PlaylistSuggestionSource | null,
): NavigationState {
  const nextItem = findNextQueueItemWithSuggestions(queue, currentClimbQueueItem, source);
  const prevItem = findPreviousQueueItem(queue, currentClimbQueueItem);

  const currentIndex = currentClimbQueueItem ? queue.findIndex(({ uuid }) => uuid === currentClimbQueueItem.uuid) : -1;
  const remainingCount = currentIndex >= 0 ? queue.length - currentIndex - 1 : queue.length;

  return {
    canNext: nextItem !== null,
    canPrevious: prevItem !== null,
    nextItem,
    prevItem,
    remainingCount,
  };
}
