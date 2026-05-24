import { describe, it, expect } from 'vitest';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { findNextQueueItem, findPreviousQueueItem, computeNavigationState } from '../queue-navigation';

function makeItem(uuid: string): ClimbQueueItem {
  return {
    uuid,
    climb: {
      uuid: `climb-${uuid}`,
      name: `Climb ${uuid}`,
      frames: '',
      setter_username: 'test',
      angle: 40,
      ascensionist_count: 0,
      difficulty: '6a/V3',
      quality_average: '3.0',
      stars: 3,
      difficulty_error: '0',
      benchmark_difficulty: null,
    },
  };
}

describe('findNextQueueItem', () => {
  it('returns null for an empty queue', () => {
    expect(findNextQueueItem([], null)).toBeNull();
  });

  it('returns the first item when there is no current item', () => {
    const items = [makeItem('a'), makeItem('b')];
    expect(findNextQueueItem(items, null)).toBe(items[0]);
  });

  it('returns the next item after the current one', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    expect(findNextQueueItem(items, items[0])).toBe(items[1]);
    expect(findNextQueueItem(items, items[1])).toBe(items[2]);
  });

  it('returns null when the current item is at the end', () => {
    const items = [makeItem('a'), makeItem('b')];
    expect(findNextQueueItem(items, items[1])).toBeNull();
  });
});

describe('findPreviousQueueItem', () => {
  it('returns null for an empty queue', () => {
    expect(findPreviousQueueItem([], null)).toBeNull();
  });

  it('returns null when there is no current item', () => {
    const items = [makeItem('a'), makeItem('b')];
    expect(findPreviousQueueItem(items, null)).toBeNull();
  });

  it('returns the previous item before the current one', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    expect(findPreviousQueueItem(items, items[2])).toBe(items[1]);
    expect(findPreviousQueueItem(items, items[1])).toBe(items[0]);
  });

  it('returns null when the current item is at the start', () => {
    const items = [makeItem('a'), makeItem('b')];
    expect(findPreviousQueueItem(items, items[0])).toBeNull();
  });
});

describe('computeNavigationState', () => {
  it('returns correct state for an empty queue', () => {
    const state = computeNavigationState([], null);
    expect(state).toEqual({
      canNext: false,
      canPrevious: false,
      nextItem: null,
      prevItem: null,
      remainingCount: 0,
    });
  });

  it('returns correct state for a single item', () => {
    const items = [makeItem('a')];
    const state = computeNavigationState(items, items[0]);
    expect(state).toEqual({
      canNext: false,
      canPrevious: false,
      nextItem: null,
      prevItem: null,
      remainingCount: 0,
    });
  });

  it('returns correct state for the middle of a queue', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    const state = computeNavigationState(items, items[1]);
    expect(state.canNext).toBe(true);
    expect(state.canPrevious).toBe(true);
    expect(state.nextItem).toBe(items[2]);
    expect(state.prevItem).toBe(items[0]);
    expect(state.remainingCount).toBe(1);
  });

  it('returns correct state when current item is not in queue', () => {
    const items = [makeItem('a'), makeItem('b')];
    const orphan = makeItem('not-in-queue');
    const state = computeNavigationState(items, orphan);
    // currentIndex will be -1, so remainingCount = queue.length
    expect(state.remainingCount).toBe(2);
    // findNextQueueItem with an item not in queue: currentIndex is -1, nextIndex is 0
    expect(state.canNext).toBe(true);
    expect(state.nextItem).toBe(items[0]);
    // findPreviousQueueItem with an item not in queue: prevIndex is -2
    expect(state.canPrevious).toBe(false);
    expect(state.prevItem).toBeNull();
  });
});
