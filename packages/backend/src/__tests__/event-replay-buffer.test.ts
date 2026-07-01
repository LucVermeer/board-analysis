/**
 * Regression coverage for the delta-replay buffer excluding
 * `PlaybackStateChanged` events (see `publishQueueEvent` / `getEventsSince`
 * in `pubsub/index.ts`).
 *
 * Before this fix, every `publishPlaybackState` broadcast (up to 3600/min
 * during active playback) was buffered into the same 100-entry Redis list as
 * real queue mutations. That silently evicted real events within seconds and
 * handed reconnecting clients duplicate/non-monotonic sequences (playback
 * events reuse the room's current sequence instead of incrementing it).
 *
 * These tests exercise the real `pubsub` singleton against Redis, mirroring
 * the "holder state + hand-off (Redis)" pattern in board-presence.test.ts:
 * `pubsub` only connects to Redis when REDIS_URL is configured (CI sets it
 * to redis://localhost:6380; local runs without it skip cleanly, matching
 * every other Redis-gated suite in this file tree).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vite-plus/test';
import type { QueueEvent, ClimbQueueItem } from '@boardsesh/shared-schema';
import { pubsub } from '../pubsub';
import { redisClientManager } from '../redis/client';

function makeClimbQueueItem(uuid: string): ClimbQueueItem {
  return {
    uuid,
    climb: {
      uuid: `climb-${uuid}`,
      setter_username: 'test-setter',
      name: 'Test Climb',
      description: 'A test climb',
      frames: 'test-frames',
      angle: 40,
      ascensionist_count: 10,
      difficulty: 'V5',
      quality_average: '4.5',
      stars: 4.5,
      difficulty_error: '0.5',
      mirrored: false,
      benchmark_difficulty: null,
    },
    tickedBy: [],
    addedBy: undefined,
    suggested: false,
  };
}

function queueItemAddedEvent(sequence: number, uuid: string): QueueEvent {
  return {
    __typename: 'QueueItemAdded',
    sequence,
    stateHash: `hash-${sequence}`,
    item: makeClimbQueueItem(uuid),
    position: 0,
  };
}

function playbackStateChangedEvent(sequence: number, overrides: Partial<QueueEvent> = {}): QueueEvent {
  return {
    __typename: 'PlaybackStateChanged',
    sequence,
    climbUuid: 'playback-climb-uuid',
    frameIndex: 0,
    isPlaying: true,
    speed: 1,
    paceMs: 250,
    anchorTimestamp: String(Date.now()),
    clientId: 'conn-playback',
    ...overrides,
  } as QueueEvent;
}

describe('event replay buffer excludes PlaybackStateChanged', () => {
  let redisOn = false;

  beforeAll(async () => {
    await pubsub.initialize().catch(() => {});
    redisOn = pubsub.isRedisConnected();
    if (!redisOn) {
      console.warn('[event-replay-buffer] pubsub Redis unavailable — skipping delta-replay buffer tests');
    }
  });

  afterAll(async () => {
    if (redisOn) await redisClientManager.disconnect().catch(() => {});
  });

  afterEach(async () => {
    if (!redisOn) return;
    const { publisher } = redisClientManager.getClients();
    await publisher.del(`session:event-replay-flood:events`);
    await publisher.del(`session:event-replay-preseed:events`);
  });

  it('a flood of PlaybackStateChanged events does not evict a real queue event from the buffer', async () => {
    if (!redisOn) return;
    const sessionId = 'event-replay-flood';

    // A real queue mutation lands first...
    pubsub.publishQueueEvent(sessionId, queueItemAddedEvent(1, 'flood-item'));

    // ...then playback broadcasts flood in behind it. Under the old
    // (buggy) behaviour, LPUSH + LTRIM(0,99) would push the QueueItemAdded
    // out of the 100-entry buffer well before we reach 150.
    for (let i = 0; i < 150; i++) {
      pubsub.publishQueueEvent(sessionId, playbackStateChangedEvent(1));
    }

    // publishQueueEvent buffers fire-and-forget; give the async writes a
    // moment to land before reading back.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const events = await pubsub.getEventsSince(sessionId, 0);

    const playbackEvents = events.filter((event) => event.__typename === 'PlaybackStateChanged');
    const queueItemAddedEvents = events.filter((event) => event.__typename === 'QueueItemAdded');

    expect(playbackEvents).toHaveLength(0);
    expect(queueItemAddedEvents).toHaveLength(1);
    expect((queueItemAddedEvents[0] as Extract<QueueEvent, { __typename: 'QueueItemAdded' }>).item.uuid).toBe(
      'flood-item',
    );
  });

  it('filters a pre-seeded PlaybackStateChanged buffer entry on read (mixed-version rollout defense)', async () => {
    if (!redisOn) return;
    const sessionId = 'event-replay-preseed';
    const { publisher } = redisClientManager.getClients();
    const bufferKey = `session:${sessionId}:events`;

    // Simulate an old-code instance that still buffered a playback event
    // directly in Redis (bypassing publishQueueEvent's new skip), alongside
    // a real queue event.
    await publisher.lpush(bufferKey, JSON.stringify(queueItemAddedEvent(1, 'preseed-item')));
    await publisher.lpush(bufferKey, JSON.stringify(playbackStateChangedEvent(1)));
    await publisher.expire(bufferKey, 300);

    const events = await pubsub.getEventsSince(sessionId, 0);

    expect(events.some((event) => event.__typename === 'PlaybackStateChanged')).toBe(false);
    const queueItemAddedEvents = events.filter((event) => event.__typename === 'QueueItemAdded');
    expect(queueItemAddedEvents).toHaveLength(1);
    expect((queueItemAddedEvents[0] as Extract<QueueEvent, { __typename: 'QueueItemAdded' }>).item.uuid).toBe(
      'preseed-item',
    );
  });
});
