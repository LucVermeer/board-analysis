import { describe, it, expect } from 'vitest';
import { queueReducer, initialState } from '../reducer';
import type { QueueState, ClimbQueueItem } from '../types';

function makeClimbQueueItem(overrides: Partial<ClimbQueueItem> & { uuid: string }): ClimbQueueItem {
  return {
    uuid: overrides.uuid,
    climb: {
      uuid: overrides.climb?.uuid ?? `climb-${overrides.uuid}`,
      name: overrides.climb?.name ?? 'Test Climb',
      frames: overrides.climb?.frames ?? '',
      mirrored: overrides.climb?.mirrored ?? false,
      ...overrides.climb,
    },
    addedBy: overrides.addedBy ?? null,
    suggested: overrides.suggested ?? false,
  } as ClimbQueueItem;
}

function makeState(overrides: Partial<QueueState> = {}): QueueState {
  return {
    ...initialState({}),
    ...overrides,
  };
}

describe('initialState', () => {
  it('returns correct shape with empty defaults', () => {
    const state = initialState({});
    expect(state.queue).toEqual([]);
    expect(state.currentClimbQueueItem).toBeNull();
    expect(state.climbSearchParams).toEqual({});
    expect(state.playlistSuggestionSource).toBeNull();
    expect(state.hasDoneFirstFetch).toBe(false);
    expect(state.initialQueueDataReceivedFromPeers).toBe(false);
    expect(state.pendingCurrentClimbUpdates).toEqual([]);
    expect(state.lastReceivedSequence).toBeNull();
    expect(state.lastReceivedStateHash).toBeNull();
    expect(state.needsResync).toBe(false);
    expect(state.optimisticDriverParticipantId).toBeNull();
  });

  it('preserves provided search params', () => {
    const params = { difficulty: 'hard' };
    const state = initialState(params);
    expect(state.climbSearchParams).toEqual(params);
  });
});

describe('ADD_TO_QUEUE', () => {
  it('adds item to the end of the queue', () => {
    const existingItem = makeClimbQueueItem({ uuid: 'existing' });
    const newItem = makeClimbQueueItem({ uuid: 'new-item' });
    const state = makeState({ queue: [existingItem] });

    const result = queueReducer(state, { type: 'ADD_TO_QUEUE', payload: newItem });
    expect(result.queue).toHaveLength(2);
    expect(result.queue[1].uuid).toBe('new-item');
  });
});

describe('REMOVE_FROM_QUEUE', () => {
  it('replaces the queue with the provided array', () => {
    const itemA = makeClimbQueueItem({ uuid: 'a' });
    const itemB = makeClimbQueueItem({ uuid: 'b' });
    const state = makeState({ queue: [itemA, itemB] });

    const result = queueReducer(state, { type: 'REMOVE_FROM_QUEUE', payload: [itemA] });
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0].uuid).toBe('a');
  });
});

describe('SET_CURRENT_CLIMB', () => {
  it('inserts item after current when current exists in queue', () => {
    const current = makeClimbQueueItem({ uuid: 'current' });
    const trailing = makeClimbQueueItem({ uuid: 'trailing' });
    const newCurrent = makeClimbQueueItem({ uuid: 'new-current' });
    const state = makeState({
      queue: [current, trailing],
      currentClimbQueueItem: current,
    });

    const result = queueReducer(state, { type: 'SET_CURRENT_CLIMB', payload: newCurrent });
    expect(result.currentClimbQueueItem?.uuid).toBe('new-current');
    expect(result.queue.map((item) => item.uuid)).toEqual(['current', 'new-current', 'trailing']);
  });

  it('appends to queue when no current climb exists', () => {
    const newCurrent = makeClimbQueueItem({ uuid: 'new-current' });
    const state = makeState({ queue: [], currentClimbQueueItem: null });

    const result = queueReducer(state, { type: 'SET_CURRENT_CLIMB', payload: newCurrent });
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0].uuid).toBe('new-current');
  });
});

describe('DELTA_ADD_QUEUE_ITEM', () => {
  it('is idempotent - adding same uuid twice does not duplicate', () => {
    const item = makeClimbQueueItem({ uuid: 'item-1' });
    const state = makeState({ queue: [item] });

    const result = queueReducer(state, {
      type: 'DELTA_ADD_QUEUE_ITEM',
      payload: { item },
    });
    expect(result.queue).toHaveLength(1);
    expect(result).toBe(state); // referential identity preserved
  });

  it('adds new item to queue', () => {
    const item = makeClimbQueueItem({ uuid: 'new-item' });
    const state = makeState({ queue: [] });

    const result = queueReducer(state, {
      type: 'DELTA_ADD_QUEUE_ITEM',
      payload: { item },
    });
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0].uuid).toBe('new-item');
  });

  it('inserts at specified position', () => {
    const itemA = makeClimbQueueItem({ uuid: 'a' });
    const itemB = makeClimbQueueItem({ uuid: 'b' });
    const newItem = makeClimbQueueItem({ uuid: 'inserted' });
    const state = makeState({ queue: [itemA, itemB] });

    const result = queueReducer(state, {
      type: 'DELTA_ADD_QUEUE_ITEM',
      payload: { item: newItem, position: 1 },
    });
    expect(result.queue.map((queueItem) => queueItem.uuid)).toEqual(['a', 'inserted', 'b']);
  });
});

describe('DELTA_REMOVE_QUEUE_ITEM', () => {
  it('clears currentClimbQueueItem if the removed item was current', () => {
    const item = makeClimbQueueItem({ uuid: 'current-item' });
    const state = makeState({
      queue: [item],
      currentClimbQueueItem: item,
    });

    const result = queueReducer(state, {
      type: 'DELTA_REMOVE_QUEUE_ITEM',
      payload: { uuid: 'current-item' },
    });
    expect(result.queue).toHaveLength(0);
    expect(result.currentClimbQueueItem).toBeNull();
  });

  it('preserves currentClimbQueueItem if a different item is removed', () => {
    const current = makeClimbQueueItem({ uuid: 'current' });
    const other = makeClimbQueueItem({ uuid: 'other' });
    const state = makeState({
      queue: [current, other],
      currentClimbQueueItem: current,
    });

    const result = queueReducer(state, {
      type: 'DELTA_REMOVE_QUEUE_ITEM',
      payload: { uuid: 'other' },
    });
    expect(result.queue).toHaveLength(1);
    expect(result.currentClimbQueueItem?.uuid).toBe('current');
  });
});

describe('DELTA_REORDER_QUEUE_ITEM', () => {
  it('reorders with valid indices', () => {
    const itemA = makeClimbQueueItem({ uuid: 'a' });
    const itemB = makeClimbQueueItem({ uuid: 'b' });
    const itemC = makeClimbQueueItem({ uuid: 'c' });
    const state = makeState({ queue: [itemA, itemB, itemC] });

    const result = queueReducer(state, {
      type: 'DELTA_REORDER_QUEUE_ITEM',
      payload: { uuid: 'a', oldIndex: 0, newIndex: 2 },
    });
    expect(result.queue.map((item) => item.uuid)).toEqual(['b', 'c', 'a']);
  });

  it('returns unchanged state with invalid indices', () => {
    const itemA = makeClimbQueueItem({ uuid: 'a' });
    const state = makeState({ queue: [itemA] });

    const result = queueReducer(state, {
      type: 'DELTA_REORDER_QUEUE_ITEM',
      payload: { uuid: 'a', oldIndex: 0, newIndex: 5 },
    });
    expect(result).toBe(state);
  });

  it('returns unchanged state when uuid does not match item at oldIndex', () => {
    const itemA = makeClimbQueueItem({ uuid: 'a' });
    const itemB = makeClimbQueueItem({ uuid: 'b' });
    const state = makeState({ queue: [itemA, itemB] });

    const result = queueReducer(state, {
      type: 'DELTA_REORDER_QUEUE_ITEM',
      payload: { uuid: 'b', oldIndex: 0, newIndex: 1 },
    });
    expect(result).toBe(state);
  });
});

describe('MIRROR_CLIMB', () => {
  it('toggles mirrored on current climb', () => {
    const item = makeClimbQueueItem({ uuid: 'climb-1' });
    item.climb.mirrored = false;
    const state = makeState({ currentClimbQueueItem: item });

    const result = queueReducer(state, { type: 'MIRROR_CLIMB' });
    expect(result.currentClimbQueueItem?.climb.mirrored).toBe(true);
  });

  it('returns unchanged state when no current climb', () => {
    const state = makeState({ currentClimbQueueItem: null });
    const result = queueReducer(state, { type: 'MIRROR_CLIMB' });
    expect(result).toBe(state);
  });
});

describe('DELTA_MIRROR_CURRENT_CLIMB', () => {
  it('applies mirrored state when mirroredUuid matches current climb', () => {
    const item = makeClimbQueueItem({ uuid: 'climb-1' });
    item.climb.mirrored = false;
    const state = makeState({
      currentClimbQueueItem: item,
      queue: [item],
    });

    const result = queueReducer(state, {
      type: 'DELTA_MIRROR_CURRENT_CLIMB',
      payload: { mirrored: true, mirroredUuid: 'climb-1' },
    });
    expect(result.currentClimbQueueItem?.climb.mirrored).toBe(true);
    expect(result.queue[0].climb.mirrored).toBe(true);
  });

  it('returns unchanged state when mirroredUuid is null', () => {
    const item = makeClimbQueueItem({ uuid: 'climb-1' });
    const state = makeState({ currentClimbQueueItem: item });

    const result = queueReducer(state, {
      type: 'DELTA_MIRROR_CURRENT_CLIMB',
      payload: { mirrored: true, mirroredUuid: null },
    });
    expect(result).toBe(state);
  });

  it('returns unchanged state when mirroredUuid does not match current', () => {
    const item = makeClimbQueueItem({ uuid: 'climb-1' });
    const state = makeState({ currentClimbQueueItem: item });

    const result = queueReducer(state, {
      type: 'DELTA_MIRROR_CURRENT_CLIMB',
      payload: { mirrored: true, mirroredUuid: 'different-climb' },
    });
    expect(result).toBe(state);
  });
});

describe('DELTA_UPDATE_CURRENT_CLIMB', () => {
  it('suppresses echo via correlationId', () => {
    const item = makeClimbQueueItem({ uuid: 'climb-1' });
    const correlationId = 'corr-123';
    const state = makeState({
      currentClimbQueueItem: item,
      pendingCurrentClimbUpdates: [correlationId],
    });

    const result = queueReducer(state, {
      type: 'DELTA_UPDATE_CURRENT_CLIMB',
      payload: {
        item,
        isServerEvent: true,
        serverCorrelationId: correlationId,
      },
    });
    // Should remove the matching correlationId from pending
    expect(result.pendingCurrentClimbUpdates).not.toContain(correlationId);
    // Should NOT update current climb (echo suppression)
    expect(result.currentClimbQueueItem).toBe(state.currentClimbQueueItem);
  });

  it('adds correlationId to pending for local updates', () => {
    const item = makeClimbQueueItem({ uuid: 'new-climb' });
    const state = makeState({ currentClimbQueueItem: null });

    const result = queueReducer(state, {
      type: 'DELTA_UPDATE_CURRENT_CLIMB',
      payload: {
        item,
        correlationId: 'local-corr-1',
      },
    });
    expect(result.pendingCurrentClimbUpdates).toContain('local-corr-1');
    expect(result.currentClimbQueueItem?.uuid).toBe('new-climb');
  });
});

describe('OPTIMISTIC_SET_DRIVER', () => {
  it('sets the optimistic driver participant id', () => {
    const state = makeState({ optimisticDriverParticipantId: null });
    const result = queueReducer(state, {
      type: 'OPTIMISTIC_SET_DRIVER',
      payload: { participantId: 'user-42' },
    });
    expect(result.optimisticDriverParticipantId).toBe('user-42');
  });

  it('is idempotent for same participant id', () => {
    const state = makeState({ optimisticDriverParticipantId: 'user-42' });
    const result = queueReducer(state, {
      type: 'OPTIMISTIC_SET_DRIVER',
      payload: { participantId: 'user-42' },
    });
    expect(result).toBe(state);
  });
});

describe('OPTIMISTIC_CLEAR_DRIVER', () => {
  it('clears the optimistic driver', () => {
    const state = makeState({ optimisticDriverParticipantId: 'user-42' });
    const result = queueReducer(state, { type: 'OPTIMISTIC_CLEAR_DRIVER' });
    expect(result.optimisticDriverParticipantId).toBeNull();
  });

  it('is idempotent when already null', () => {
    const state = makeState({ optimisticDriverParticipantId: null });
    const result = queueReducer(state, { type: 'OPTIMISTIC_CLEAR_DRIVER' });
    expect(result).toBe(state);
  });
});
