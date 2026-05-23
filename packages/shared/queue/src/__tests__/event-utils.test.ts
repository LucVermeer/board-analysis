import { describe, it, expect } from 'vitest';
import { insertQueueItemIdempotent, evaluateQueueEventSequence } from '../event-utils';

type TestItem = { uuid: string; value: string };

describe('insertQueueItemIdempotent', () => {
  it('adds a new item to the end of the queue', () => {
    const queue: TestItem[] = [{ uuid: 'a', value: 'first' }];
    const newItem: TestItem = { uuid: 'b', value: 'second' };

    const result = insertQueueItemIdempotent(queue, newItem);
    expect(result).toHaveLength(2);
    expect(result[1].uuid).toBe('b');
  });

  it('returns the same array reference if item already exists', () => {
    const queue: TestItem[] = [{ uuid: 'a', value: 'first' }];
    const duplicate: TestItem = { uuid: 'a', value: 'different-value' };

    const result = insertQueueItemIdempotent(queue, duplicate);
    expect(result).toBe(queue); // referential identity
    expect(result).toHaveLength(1);
  });

  it('inserts at a specified position', () => {
    const queue: TestItem[] = [
      { uuid: 'a', value: 'first' },
      { uuid: 'c', value: 'third' },
    ];
    const newItem: TestItem = { uuid: 'b', value: 'second' };

    const result = insertQueueItemIdempotent(queue, newItem, 1);
    expect(result.map((item) => item.uuid)).toEqual(['a', 'b', 'c']);
  });

  it('inserts at position 0 (beginning)', () => {
    const queue: TestItem[] = [{ uuid: 'b', value: 'second' }];
    const newItem: TestItem = { uuid: 'a', value: 'first' };

    const result = insertQueueItemIdempotent(queue, newItem, 0);
    expect(result[0].uuid).toBe('a');
  });

  it('appends when position exceeds queue length', () => {
    const queue: TestItem[] = [{ uuid: 'a', value: 'first' }];
    const newItem: TestItem = { uuid: 'b', value: 'second' };

    // position 100 is out of range, but position must be <= length per the code
    // so it falls through to push
    const result = insertQueueItemIdempotent(queue, newItem, 100);
    expect(result).toHaveLength(2);
    expect(result[1].uuid).toBe('b');
  });
});

describe('evaluateQueueEventSequence', () => {
  it('returns "apply" when lastSequence is null (first event)', () => {
    expect(evaluateQueueEventSequence(null, 1)).toBe('apply');
  });

  it('returns "apply" for contiguous sequence (lastSequence + 1)', () => {
    expect(evaluateQueueEventSequence(5, 6)).toBe('apply');
  });

  it('returns "ignore-stale" for stale events (eventSequence <= lastSequence)', () => {
    expect(evaluateQueueEventSequence(5, 5)).toBe('ignore-stale');
    expect(evaluateQueueEventSequence(5, 3)).toBe('ignore-stale');
  });

  it('returns "gap" when there is a gap in the sequence', () => {
    expect(evaluateQueueEventSequence(5, 8)).toBe('gap');
    expect(evaluateQueueEventSequence(5, 7)).toBe('gap');
  });
});
