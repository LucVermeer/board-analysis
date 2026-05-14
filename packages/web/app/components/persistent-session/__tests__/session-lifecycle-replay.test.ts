import { describe, expect, it } from 'vite-plus/test';
import type { QueueEvent, SubscriptionQueueEvent } from '@boardsesh/shared-schema';
import { hasContiguousReplayCoverage, transformToSubscriptionEvent } from '../hooks/use-session-lifecycle';

const queueItem = {
  uuid: 'queue-item-1',
  climb: {
    uuid: 'climb-1',
    setter_username: 'setter',
    name: 'Test Climb',
    description: '',
    frames: '',
    angle: 40,
    ascensionist_count: 0,
    difficulty: '6A',
    quality_average: '3.5',
    stars: 3.5,
    difficulty_error: '0.5',
    mirrored: false,
    benchmark_difficulty: null,
  },
  suggested: false,
};

describe('session lifecycle replay helpers', () => {
  it('preserves aliased QueueItemAdded replay events', () => {
    const event: SubscriptionQueueEvent = {
      __typename: 'QueueItemAdded',
      sequence: 6,
      stateHash: 'hash-6',
      addedItem: queueItem,
      position: null,
    };

    expect(transformToSubscriptionEvent(event)).toEqual(event);
  });

  it('maps unaliased CurrentClimbChanged replay events to subscription shape', () => {
    const event: QueueEvent = {
      __typename: 'CurrentClimbChanged',
      sequence: 6,
      stateHash: 'hash-6',
      item: queueItem,
      clientId: 'client-1',
      correlationId: 'correlation-1',
    };

    expect(transformToSubscriptionEvent(event)).toEqual({
      __typename: 'CurrentClimbChanged',
      sequence: 6,
      stateHash: 'hash-6',
      currentItem: queueItem,
      clientId: 'client-1',
      correlationId: 'correlation-1',
    });
  });

  it('maps unaliased ClimbMirrored replay events to subscription shape', () => {
    const event: QueueEvent = {
      __typename: 'ClimbMirrored',
      sequence: 7,
      stateHash: 'hash-7',
      uuid: 'queue-item-1',
      mirrored: true,
    };

    expect(transformToSubscriptionEvent(event)).toEqual({
      __typename: 'ClimbMirrored',
      sequence: 7,
      stateHash: 'hash-7',
      mirroredUuid: 'queue-item-1',
      mirrored: true,
    });
  });

  it('keeps mirroredUuid null when ClimbMirrored arrives with no current climb', () => {
    // The backend resolver early-returns when there's no current climb (B7
    // fix), but historic replay payloads can still carry null uuid. The
    // transform must preserve null instead of fabricating a value — the
    // downstream reducer's uuid guard relies on null meaning "no specific
    // climb."
    const event: QueueEvent = {
      __typename: 'ClimbMirrored',
      sequence: 9,
      stateHash: 'hash-9',
      uuid: null,
      mirrored: true,
    };

    expect(transformToSubscriptionEvent(event)).toEqual({
      __typename: 'ClimbMirrored',
      sequence: 9,
      stateHash: 'hash-9',
      mirroredUuid: null,
      mirrored: true,
    });
  });

  it('rejects replay coverage with a missing sequence', () => {
    const events: SubscriptionQueueEvent[] = [
      {
        __typename: 'QueueItemAdded',
        sequence: 6,
        stateHash: 'hash-6',
        addedItem: queueItem,
      },
      {
        __typename: 'CurrentClimbChanged',
        sequence: 8,
        stateHash: 'hash-8',
        currentItem: queueItem,
        clientId: null,
        correlationId: null,
      },
    ];

    expect(hasContiguousReplayCoverage(events, 5, 8)).toBe(false);
  });

  it('allows FullSync to cover earlier missing sequences and same-sequence controller events', () => {
    const events: SubscriptionQueueEvent[] = [
      {
        __typename: 'FullSync',
        sequence: 8,
        state: {
          sequence: 8,
          stateHash: 'hash-8',
          queue: [queueItem],
          currentClimbQueueItem: queueItem,
        },
      },
      {
        __typename: 'CurrentClimbChanged',
        sequence: 8,
        stateHash: 'hash-8',
        currentItem: queueItem,
        clientId: 'controller-1',
        correlationId: null,
      },
    ];

    expect(hasContiguousReplayCoverage(events, 5, 8)).toBe(true);
  });

  it('handles reverse-order FullSync + same-sequence delta from the backend', () => {
    // Verifies the explicit tie-breaker: even when the backend returns the
    // delta before its co-sequenced FullSync, the sort prioritises FullSync
    // so the contiguity check still passes.
    const events: SubscriptionQueueEvent[] = [
      {
        __typename: 'CurrentClimbChanged',
        sequence: 8,
        stateHash: 'hash-8',
        currentItem: queueItem,
        clientId: 'controller-1',
        correlationId: null,
      },
      {
        __typename: 'FullSync',
        sequence: 8,
        state: {
          sequence: 8,
          stateHash: 'hash-8',
          queue: [queueItem],
          currentClimbQueueItem: queueItem,
        },
      },
    ];

    expect(hasContiguousReplayCoverage(events, 5, 8)).toBe(true);
  });

  it('handles QueueItemAdded co-sequenced with a FullSync (delta arrives first)', () => {
    // Same tie-break invariant as the CurrentClimbChanged case but with a
    // QueueItemAdded delta. The sort puts FullSync first so the contiguity
    // check still passes regardless of arrival order.
    const events: SubscriptionQueueEvent[] = [
      {
        __typename: 'QueueItemAdded',
        sequence: 8,
        stateHash: 'hash-8',
        addedItem: queueItem,
        position: null,
      },
      {
        __typename: 'FullSync',
        sequence: 8,
        state: {
          sequence: 8,
          stateHash: 'hash-8',
          queue: [queueItem],
          currentClimbQueueItem: queueItem,
        },
      },
    ];

    expect(hasContiguousReplayCoverage(events, 5, 8)).toBe(true);
  });
});
