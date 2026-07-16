/**
 * Tests for `setCurrentClimbAndPublish` — the shared helper consolidated in
 * Phase 3.2 of the queue-control-bar pivot simplify pass.
 *
 * The helper now accepts `item: ClimbQueueItem | null`. Coverage here exists
 * because the consolidation pulled three call sites (queue/setCurrentClimb
 * with non-null item, queue/setCurrentClimb with null item, the widget
 * re-assert handler) through the same path, and the null-item branch had its
 * own retry+publish ladder before the refactor.
 *
 * Behaviours verified:
 *  1. `item: null` → publishes `CurrentClimbChanged { item: null }`, never
 *     `FullSync`. The wire format change is the user-visible bit of the
 *     refactor — a regression here would break clear-current-climb syncs.
 *  2. `item: null, shouldAddToQueue: true` → the `shouldAddToQueue` flag is
 *     ignored (no climb to add); still emits `CurrentClimbChanged`.
 *  3. `item: null` → `pushRecentClimb` is not called. The ring buffer only
 *     accepts authoritative wall climbs; a clear is not one.
 *  4. `item: <climb>, shouldAddToQueue: true, not in queue` → publishes
 *     `FullSync` whose queue has the new climb inserted immediately after the
 *     current climb (issue #2217), falling back to append when there is no
 *     current climb to anchor to.
 *  5. `item: <climb>, shouldAddToQueue: true, already in queue` → publishes
 *     `CurrentClimbChanged` (no second copy of the queue item).
 *  6. `clientId` / `correlationId` flow through to `CurrentClimbChanged`
 *     unchanged.
 */

import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { ClimbQueueItem } from '@boardsesh/shared-schema';
import { setCurrentClimbAndPublish } from '../services/queue-navigation';
import type { RoomManager } from '../services/room-manager/room-manager';
import type { pubsub as PubSubInstance } from '../pubsub/index';
// The mocked room manager + pubsub satisfy only the slice of the interfaces
// that `setCurrentClimbAndPublish` touches; the casts at call sites narrow
// the structural types so we don't need to stub the full surface.

function makeClimb(uuid = 'item-1', climbUuid = 'climb-1'): ClimbQueueItem {
  return {
    uuid,
    climb: { uuid: climbUuid, name: 'Test Climb' },
    addedBy: 'participant-1',
    suggested: false,
  } as ClimbQueueItem;
}

type MockedRoomManager = {
  getQueueState: ReturnType<typeof vi.fn>;
  updateQueueState: ReturnType<typeof vi.fn>;
  pushRecentClimb: ReturnType<typeof vi.fn>;
};

function makeRoomManager(
  overrides: Partial<{
    queue: ClimbQueueItem[];
    currentClimb: ClimbQueueItem | null;
    sequence: number;
    stateHash: string;
    version: number;
  }> = {},
): MockedRoomManager {
  const initialQueue = overrides.queue ?? [];
  const sequence = overrides.sequence ?? 1;
  const stateHash = overrides.stateHash ?? 'hash-1';
  return {
    getQueueState: vi.fn().mockResolvedValue({
      queue: initialQueue,
      currentClimbQueueItem: overrides.currentClimb ?? null,
      sequence: 0,
      stateHash: 'hash-0',
      version: overrides.version ?? 0,
    }),
    updateQueueState: vi.fn().mockResolvedValue({ sequence, stateHash, version: 1, previousStateHash: 'hash-0' }),
    pushRecentClimb: vi.fn().mockResolvedValue(undefined),
  };
}

function makePubsub(): { publishQueueEvent: ReturnType<typeof vi.fn> } {
  return { publishQueueEvent: vi.fn() };
}

describe('setCurrentClimbAndPublish — null-item path', () => {
  let roomManager: ReturnType<typeof makeRoomManager>;
  let pubsub: ReturnType<typeof makePubsub>;

  beforeEach(() => {
    roomManager = makeRoomManager();
    pubsub = makePubsub();
  });

  it('publishes CurrentClimbChanged with item: null (not FullSync)', async () => {
    await setCurrentClimbAndPublish(
      'session-1',
      null,
      false,
      roomManager as unknown as RoomManager,
      pubsub as unknown as typeof PubSubInstance,
      'client-1',
      'corr-1',
    );

    expect(pubsub.publishQueueEvent).toHaveBeenCalledTimes(1);
    const [sessionId, event] = pubsub.publishQueueEvent.mock.calls[0];
    expect(sessionId).toBe('session-1');
    expect(event.__typename).toBe('CurrentClimbChanged');
    expect(event.item).toBeNull();
    expect(event.clientId).toBe('client-1');
    expect(event.correlationId).toBe('corr-1');
  });

  it('ignores shouldAddToQueue: true when item is null (still CurrentClimbChanged, no queue append)', async () => {
    await setCurrentClimbAndPublish(
      'session-1',
      null,
      true,
      roomManager as unknown as RoomManager,
      pubsub as unknown as typeof PubSubInstance,
    );

    expect(pubsub.publishQueueEvent).toHaveBeenCalledTimes(1);
    expect(pubsub.publishQueueEvent.mock.calls[0][1].__typename).toBe('CurrentClimbChanged');
    // updateQueueState gets the original (empty) queue — no append happened.
    expect(roomManager.updateQueueState).toHaveBeenCalledWith('session-1', [], null, 0);
  });

  it('does not call pushRecentClimb when item is null (ring buffer skipped)', async () => {
    await setCurrentClimbAndPublish(
      'session-1',
      null,
      false,
      roomManager as unknown as RoomManager,
      pubsub as unknown as typeof PubSubInstance,
    );

    expect(roomManager.pushRecentClimb).not.toHaveBeenCalled();
  });

  it('defaults clientId / correlationId to null on the wire when omitted', async () => {
    await setCurrentClimbAndPublish(
      'session-1',
      null,
      false,
      roomManager as unknown as RoomManager,
      pubsub as unknown as typeof PubSubInstance,
    );

    const event = pubsub.publishQueueEvent.mock.calls[0][1];
    expect(event.clientId).toBeNull();
    expect(event.correlationId).toBeNull();
  });
});

describe('setCurrentClimbAndPublish — non-null item', () => {
  let pubsub: ReturnType<typeof makePubsub>;

  beforeEach(() => {
    pubsub = makePubsub();
  });

  it('publishes FullSync when shouldAddToQueue=true and the climb is not in the queue', async () => {
    const roomManager = makeRoomManager({ queue: [] });
    const item = makeClimb();

    await setCurrentClimbAndPublish(
      'session-1',
      item,
      true,
      roomManager as unknown as RoomManager,
      pubsub as unknown as typeof PubSubInstance,
    );

    expect(pubsub.publishQueueEvent).toHaveBeenCalledTimes(1);
    const event = pubsub.publishQueueEvent.mock.calls[0][1];
    expect(event.__typename).toBe('FullSync');
    expect(event.state.queue).toEqual([item]);
    expect(event.state.currentClimbQueueItem).toEqual(item);
    expect(roomManager.pushRecentClimb).toHaveBeenCalledWith('session-1', 'climb-1');
  });

  it('inserts a new climb immediately after the current climb, not at the end (issue #2217)', async () => {
    const climbA = makeClimb('item-a', 'climb-a');
    const climbB = makeClimb('item-b', 'climb-b');
    const climbC = makeClimb('item-c', 'climb-c');
    const newClimb = makeClimb('item-x', 'climb-x');
    const roomManager = makeRoomManager({ queue: [climbA, climbB, climbC], currentClimb: climbA });

    await setCurrentClimbAndPublish(
      'session-1',
      newClimb,
      true,
      roomManager as unknown as RoomManager,
      pubsub as unknown as typeof PubSubInstance,
    );

    const event = pubsub.publishQueueEvent.mock.calls[0][1];
    expect(event.__typename).toBe('FullSync');
    // New climb slots in right after the current climb (A), pushing A into
    // history — NOT appended after C.
    expect(event.state.queue).toEqual([climbA, newClimb, climbB, climbC]);
    expect(event.state.currentClimbQueueItem).toEqual(newClimb);
    // The persisted queue matches the published order.
    expect(roomManager.updateQueueState).toHaveBeenCalledWith(
      'session-1',
      [climbA, newClimb, climbB, climbC],
      newClimb,
      0,
    );
  });

  it('falls back to appending when there is no current climb to anchor the insertion', async () => {
    const climbA = makeClimb('item-a', 'climb-a');
    const climbB = makeClimb('item-b', 'climb-b');
    const newClimb = makeClimb('item-x', 'climb-x');
    const roomManager = makeRoomManager({ queue: [climbA, climbB], currentClimb: null });

    await setCurrentClimbAndPublish(
      'session-1',
      newClimb,
      true,
      roomManager as unknown as RoomManager,
      pubsub as unknown as typeof PubSubInstance,
    );

    const event = pubsub.publishQueueEvent.mock.calls[0][1];
    expect(event.__typename).toBe('FullSync');
    expect(event.state.queue).toEqual([climbA, climbB, newClimb]);
    // The persisted queue matches the published order (append fallback).
    expect(roomManager.updateQueueState).toHaveBeenCalledWith('session-1', [climbA, climbB, newClimb], newClimb, 0);
  });

  it('inserts after current regardless of the suggested flag (web peek-promotion shape)', async () => {
    // Web's setCurrentClimbQueueItem promotes a suggested/peek climb via
    // setCurrentClimb(item, suggested). The positioning here is driven purely by
    // the current-climb anchor, NOT by `suggested` — pin that so a future change
    // can't accidentally special-case suggested climbs back to appending.
    const climbA = makeClimb('item-a', 'climb-a');
    const climbB = makeClimb('item-b', 'climb-b');
    const suggestedClimb = { ...makeClimb('item-x', 'climb-x'), suggested: true } as ClimbQueueItem;
    const roomManager = makeRoomManager({ queue: [climbA, climbB], currentClimb: climbA });

    await setCurrentClimbAndPublish(
      'session-1',
      suggestedClimb,
      true,
      roomManager as unknown as RoomManager,
      pubsub as unknown as typeof PubSubInstance,
    );

    const event = pubsub.publishQueueEvent.mock.calls[0][1];
    expect(event.__typename).toBe('FullSync');
    expect(event.state.queue).toEqual([climbA, suggestedClimb, climbB]);
    expect(event.state.currentClimbQueueItem).toEqual(suggestedClimb);
  });

  it('publishes CurrentClimbChanged when shouldAddToQueue=true but the climb is already queued', async () => {
    const item = makeClimb();
    const roomManager = makeRoomManager({ queue: [item] });

    await setCurrentClimbAndPublish(
      'session-1',
      item,
      true,
      roomManager as unknown as RoomManager,
      pubsub as unknown as typeof PubSubInstance,
    );

    expect(pubsub.publishQueueEvent).toHaveBeenCalledTimes(1);
    expect(pubsub.publishQueueEvent.mock.calls[0][1].__typename).toBe('CurrentClimbChanged');
    expect(pubsub.publishQueueEvent.mock.calls[0][1].item).toEqual(item);
  });
});
