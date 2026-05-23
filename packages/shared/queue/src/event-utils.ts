/**
 * Pure utility functions for queue event processing.
 * No React, no DOM — works in any JS runtime.
 */

type UuidItem = {
  uuid: string;
};

/**
 * Idempotent insert: if an item with the same uuid already exists in the queue,
 * returns the original array unchanged (referential identity preserved).
 * Optionally inserts at a specific position.
 */
export function insertQueueItemIdempotent<T extends UuidItem>(queue: T[], item: T, position?: number): T[] {
  if (queue.some((existingItem) => existingItem.uuid === item.uuid)) {
    return queue;
  }

  const nextQueue = [...queue];
  if (position !== undefined && position >= 0 && position <= nextQueue.length) {
    nextQueue.splice(position, 0, item);
    return nextQueue;
  }

  nextQueue.push(item);
  return nextQueue;
}

export type QueueSequenceDecision = 'apply' | 'ignore-stale' | 'gap';

/**
 * Determine what to do with an incoming queue event based on its sequence number
 * relative to the last-known sequence.
 *
 * - null lastSequence: first event, always apply
 * - eventSequence <= lastSequence: stale duplicate, ignore
 * - eventSequence === lastSequence + 1: contiguous, apply
 * - eventSequence > lastSequence + 1: gap detected, caller should request resync
 */
export function evaluateQueueEventSequence(lastSequence: number | null, eventSequence: number): QueueSequenceDecision {
  if (lastSequence === null) {
    return 'apply';
  }

  if (eventSequence <= lastSequence) {
    return 'ignore-stale';
  }

  if (eventSequence > lastSequence + 1) {
    return 'gap';
  }

  return 'apply';
}
