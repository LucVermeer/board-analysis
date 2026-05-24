import type { ClimbQueueItem, ClimbQueue } from '@boardsesh/queue';

/**
 * Find the next item in the queue relative to the current climb.
 * Returns null if there is no next item (already at end, empty queue, etc.).
 *
 * When there is no current climb, returns the first queue item.
 */
export function findNextQueueItem(
  queue: ClimbQueue,
  currentClimbQueueItem: ClimbQueueItem | null,
): ClimbQueueItem | null {
  if (queue.length === 0) return null;

  if (!currentClimbQueueItem) {
    return queue[0];
  }

  const currentIndex = queue.findIndex(({ uuid }) => uuid === currentClimbQueueItem.uuid);
  const nextIndex = currentIndex + 1;

  if (nextIndex < queue.length) {
    return queue[nextIndex];
  }

  return null;
}

/**
 * Find the previous item in the queue relative to the current climb.
 * Returns null if there is no previous item (already at start, empty queue,
 * no current climb, etc.).
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
