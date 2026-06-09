import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vite-plus/test';
import Redis from 'ioredis';
import { sql } from 'drizzle-orm';
import type {
  ConnectionContext,
  BoardPresenceEvent,
  BoardClimbSet,
  BoardPresenceClimb,
  ClimbQueueItemInput,
} from '@boardsesh/shared-schema';
import { db } from '../db/client';
import { pubsub } from '../pubsub';
import { boardPresenceMutations } from '../graphql/resolvers/board-presence/mutations';
import { boardPresenceQueries } from '../graphql/resolvers/board-presence/queries';
import { boardPresenceSubscriptions } from '../graphql/resolvers/board-presence/subscription';

// Board presence is env-gated. Every test in this file exercises the enabled
// path, so flip it on for the suite.
const ORIGINAL_FLAG = process.env.BOARD_PRESENCE_ENABLED;
beforeAll(() => {
  process.env.BOARD_PRESENCE_ENABLED = 'true';
});
afterAll(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.BOARD_PRESENCE_ENABLED;
  } else {
    process.env.BOARD_PRESENCE_ENABLED = ORIGINAL_FLAG;
  }
});

const TEST_USER_ID = 'board-presence-test-user';
const SENDER_DISPLAY_NAME = 'Crusher Carla';
const SENDER_AVATAR_URL = 'https://example.com/carla.jpg';
const TEST_CLIMB_UUID = 'board-presence-test-climb-uuid';

function authCtx(overrides: Partial<ConnectionContext> = {}): ConnectionContext {
  return {
    connectionId: `conn-${Math.random().toString(36).slice(2)}`,
    isAuthenticated: true,
    userId: TEST_USER_ID,
    ...overrides,
  } as ConnectionContext;
}

function makeQueueItemInput(overrides: Partial<ClimbQueueItemInput['climb']> = {}): ClimbQueueItemInput {
  return {
    uuid: 'queue-item-uuid-1',
    climb: {
      uuid: TEST_CLIMB_UUID,
      setter_username: 'setter-bob',
      name: 'Real Catalog Climb',
      frames: 'p1145r12',
      angle: 40,
      ascensionist_count: 5,
      difficulty: 'V5',
      quality_average: '4.0',
      stars: 4,
      difficulty_error: '0',
      ...overrides,
    },
  };
}

async function seedUser(): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, email, name, image, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'carla@board-presence.test', 'Carla Fallback', null, now(), now())
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
  `);
  await db.execute(sql`
    INSERT INTO user_profiles (user_id, display_name, avatar_url)
    VALUES (${TEST_USER_ID}, ${SENDER_DISPLAY_NAME}, ${SENDER_AVATAR_URL})
    ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url
  `);
}

async function seedCatalogClimb(): Promise<void> {
  await db.execute(sql`
    INSERT INTO board_climbs (uuid, board_type, layout_id, name, frames, angle, is_listed, is_draft)
    VALUES (${TEST_CLIMB_UUID}, 'kilter', 1, 'Real Catalog Climb', 'p1145r12', 40, true, false)
    ON CONFLICT (uuid) DO NOTHING
  `);
}

async function cleanup(): Promise<void> {
  await db.execute(sql`DELETE FROM boardsesh_ticks WHERE user_id = ${TEST_USER_ID}`);
  await db.execute(sql`DELETE FROM user_boards WHERE owner_id = ${TEST_USER_ID}`);
  await db.execute(sql`DELETE FROM board_climbs WHERE uuid = ${TEST_CLIMB_UUID}`);
  await db.execute(sql`DELETE FROM user_profiles WHERE user_id = ${TEST_USER_ID}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${TEST_USER_ID}`);
}

// ============================================================
// Pubsub-level unit behaviour (no DB)
// ============================================================
describe('board-presence pubsub', () => {
  it('publish dispatches to local subscriber, unsubscribe stops delivery', async () => {
    const boardId = 'pubsub-board-1';
    const received: BoardPresenceEvent[] = [];
    const unsubscribe = await pubsub.subscribeBoardPresence(boardId, (event) => {
      received.push(event);
    });

    const climb: BoardPresenceClimb = {
      climbUuid: 'c1',
      sentAt: new Date().toISOString(),
      seq: 1,
    };
    pubsub.publishBoardPresenceEvent(boardId, { __typename: 'BoardClimbSet', climb });

    expect(received).toHaveLength(1);
    expect((received[0] as BoardClimbSet).climb.climbUuid).toBe('c1');

    unsubscribe();
    pubsub.publishBoardPresenceEvent(boardId, { __typename: 'BoardClimbCleared', clearedAt: 'x', seq: 2 });
    expect(received).toHaveLength(1);
  });

  it('nextBoardSeq is monotonic per board and independent across boards', async () => {
    const a = await pubsub.nextBoardSeq('seq-board-a');
    const b = await pubsub.nextBoardSeq('seq-board-a');
    const c = await pubsub.nextBoardSeq('seq-board-a');
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);

    // A different board has its own counter, unaffected by the first.
    const other = await pubsub.nextBoardSeq('seq-board-b');
    const otherNext = await pubsub.nextBoardSeq('seq-board-b');
    expect(otherNext).toBeGreaterThan(other);
  });
});

// ============================================================
// FIFO history store/getRecent — exercised against a real Redis
// (the docker test harness runs redis on 6380). Skips gracefully if
// unreachable so the rest of the suite still runs.
// ============================================================
describe('board-presence FIFO history (Redis)', () => {
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
  let redis: Redis | null = null;
  let redisReachable = false;

  beforeAll(async () => {
    redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await redis.connect();
      await redis.ping();
      redisReachable = true;
    } catch {
      redisReachable = false;
    }
  });

  afterAll(async () => {
    if (redis) {
      await redis.quit().catch(() => {});
    }
  });

  it('lpush + ltrim + sort-by-seq-desc backfill works (direct Redis FIFO contract)', async () => {
    if (!redisReachable || !redis) {
      console.warn('[board-presence] Redis unreachable — skipping FIFO history test');
      return;
    }
    const key = `board:fifo-test-${Date.now()}:history`;
    const climbs: BoardPresenceClimb[] = [];
    for (let seq = 1; seq <= 60; seq++) {
      const climb: BoardPresenceClimb = { climbUuid: `c${seq}`, sentAt: new Date().toISOString(), seq };
      climbs.push(climb);
      await redis.lpush(key, JSON.stringify(climb));
      await redis.ltrim(key, 0, 49);
    }

    const raw = await redis.lrange(key, 0, -1);
    expect(raw.length).toBe(50); // capped at 50

    const parsed = raw.map((j) => JSON.parse(j) as BoardPresenceClimb).sort((a, b) => b.seq - a.seq);
    // Newest seq first, oldest retained seq is 11 (1..10 trimmed away).
    expect(parsed[0].seq).toBe(60);
    expect(parsed[parsed.length - 1].seq).toBe(11);

    await redis.del(key);
  });
});

// ============================================================
// Resolver behaviour (DB-backed)
// ============================================================
describe('board-presence resolvers', () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser();
    await seedCatalogClimb();
  });

  afterEach(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });

  describe('feature gate', () => {
    it('throws when BOARD_PRESENCE_ENABLED is not "true"', async () => {
      process.env.BOARD_PRESENCE_ENABLED = 'false';
      try {
        await expect(boardPresenceQueries.boardPresenceStats(undefined, { boardId: 1 }, authCtx())).rejects.toThrow(
          'Board presence is not enabled',
        );
      } finally {
        process.env.BOARD_PRESENCE_ENABLED = 'true';
      }
    });
  });

  describe('resolveBoardForSerial', () => {
    it('find-or-binds: creates a board on first sighting, returns the same board on a second call', async () => {
      const serial = `SER-${Date.now()}`;
      const first = await boardPresenceMutations.resolveBoardForSerial(
        undefined,
        { serial, boardType: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2' },
        authCtx(),
      );
      expect(first.boardId).toBeGreaterThan(0);
      expect(first.boardType).toBe('kilter');

      // Second call (same serial) returns the already-bound shared board.
      const second = await boardPresenceMutations.resolveBoardForSerial(
        undefined,
        { serial, boardType: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2' },
        authCtx({ connectionId: 'conn-2' }),
      );
      expect(second.boardId).toBe(first.boardId);
    });

    it("binds the serial onto the caller's existing config-matching board", async () => {
      // Pre-create a board for this config with NO serial.
      await db.execute(sql`
        INSERT INTO user_boards (uuid, slug, owner_id, board_type, layout_id, size_id, set_ids, name, serial_number)
        VALUES (${`uuid-${Date.now()}`}, ${`slug-${Date.now()}`}, ${TEST_USER_ID}, 'kilter', 7, 11, '3,4', 'My Garage', null)
      `);

      const serial = `BIND-${Date.now()}`;
      const resolved = await boardPresenceMutations.resolveBoardForSerial(
        undefined,
        { serial, boardType: 'kilter', layoutId: 7, sizeId: 11, setIds: '3,4' },
        authCtx(),
      );
      expect(resolved.boardName).toBe('My Garage');

      const [row] = await db.execute(sql`SELECT serial_number FROM user_boards WHERE id = ${resolved.boardId}`);
      expect((row as { serial_number: string }).serial_number).toBe(serial);
    });

    it('rejects binding a second serial onto an already-bound board via the unique index', async () => {
      const serialA = `UNIQ-A-${Date.now()}`;
      const resolved = await boardPresenceMutations.resolveBoardForSerial(
        undefined,
        { serial: serialA, boardType: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2' },
        authCtx(),
      );

      // Attempt to UPDATE a *different* board to the same serial — must fail the
      // unique partial index (serial → exactly one active board).
      await db.execute(sql`
        INSERT INTO user_boards (uuid, slug, owner_id, board_type, layout_id, size_id, set_ids, name, serial_number)
        VALUES (${`uuid-other-${Date.now()}`}, ${`slug-other-${Date.now()}`}, ${TEST_USER_ID}, 'kilter', 2, 20, '5,6', 'Other Wall', null)
      `);
      const [other] = await db.execute(
        sql`SELECT id FROM user_boards WHERE owner_id = ${TEST_USER_ID} AND layout_id = 2 LIMIT 1`,
      );
      const otherId = (other as { id: number }).id;

      await expect(
        db.execute(sql`UPDATE user_boards SET serial_number = ${serialA} WHERE id = ${otherId}`),
      ).rejects.toThrow();

      // The original board still owns the serial.
      const [orig] = await db.execute(sql`SELECT serial_number FROM user_boards WHERE id = ${resolved.boardId}`);
      expect((orig as { serial_number: string }).serial_number).toBe(serialA);
    });
  });

  describe('reportBoardClimb', () => {
    let serialCounter = 0;
    async function makeBoard(): Promise<number> {
      // BoardSerialSchema caps at 32 chars and forbids dots, so keep it short
      // and alphanumeric-with-hyphens.
      const serial = `RPT-${Date.now().toString(36)}-${serialCounter++}`;
      const resolved = await boardPresenceMutations.resolveBoardForSerial(
        undefined,
        { serial, boardType: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2' },
        authCtx(),
      );
      return resolved.boardId;
    }

    it('ignores a client-supplied sender identity and stamps the server-derived display name + avatar', async () => {
      const boardId = await makeBoard();
      const received: BoardPresenceEvent[] = [];
      const unsubscribe = await pubsub.subscribeBoardPresence(String(boardId), (event) => received.push(event));

      // The input has NO identity fields (the type has none), but a malicious
      // client could try to spoof via the climb. We assert the published event
      // uses the server profile regardless.
      const ok = await boardPresenceMutations.reportBoardClimb(
        undefined,
        { boardId, climb: makeQueueItemInput(), angle: 45 },
        authCtx(),
      );
      expect(ok).toBe(true);

      expect(received).toHaveLength(1);
      const event = received[0] as BoardClimbSet;
      expect(event.__typename).toBe('BoardClimbSet');
      expect(event.climb.sentByDisplayName).toBe(SENDER_DISPLAY_NAME);
      expect(event.climb.sentByAvatarUrl).toBe(SENDER_AVATAR_URL);
      expect(event.climb.climbUuid).toBe(TEST_CLIMB_UUID);
      expect(event.climb.angle).toBe(45);
      expect(event.climb.seq).toBeGreaterThan(0);
      // Server never lets the client name the sender — there is no name input.
      unsubscribe();
    });

    it('rejects an unknown climbUuid (not in the catalog)', async () => {
      const boardId = await makeBoard();
      const bogus = makeQueueItemInput({ uuid: 'does-not-exist-uuid' });
      await expect(
        boardPresenceMutations.reportBoardClimb(undefined, { boardId, climb: bogus, angle: 40 }, authCtx()),
      ).rejects.toThrow('Unknown climb');
    });

    it('requires authentication', async () => {
      await expect(
        boardPresenceMutations.reportBoardClimb(
          undefined,
          { boardId: 1, climb: makeQueueItemInput(), angle: 40 },
          authCtx({ isAuthenticated: false, userId: undefined }),
        ),
      ).rejects.toThrow('Authentication required');
    });
  });

  describe('boardNowPlaying subscription', () => {
    it('eager-subscribes (awaits the channel) before the first reported climb is delivered', async () => {
      const boardId = await (async () => {
        const resolved = await boardPresenceMutations.resolveBoardForSerial(
          undefined,
          { serial: `SUB-${Date.now()}`, boardType: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2' },
          authCtx(),
        );
        return resolved.boardId;
      })();

      // subscribe() returns an async generator. Awaiting the first .next()
      // triggers createEagerAsyncIterator, which awaits the (Redis) subscribe
      // before resolving — so a climb reported *after* this await is captured.
      const iterator = boardPresenceSubscriptions.boardNowPlaying.subscribe(undefined, { boardId }, authCtx());

      // Prime the iterator: kick off the first next() (this runs up to the
      // first `yield`, establishing the subscription) then report a climb.
      const nextPromise = iterator.next();
      // Give the eager subscribe a tick to settle.
      await new Promise((r) => setTimeout(r, 50));

      await boardPresenceMutations.reportBoardClimb(
        undefined,
        { boardId, climb: makeQueueItemInput(), angle: 30 },
        authCtx(),
      );

      const result = await nextPromise;
      expect(result.done).toBe(false);
      const payload = result.value as { boardNowPlaying: BoardClimbSet };
      expect(payload.boardNowPlaying.__typename).toBe('BoardClimbSet');
      expect(payload.boardNowPlaying.climb.climbUuid).toBe(TEST_CLIMB_UUID);
      expect(payload.boardNowPlaying.climb.angle).toBe(30);

      await iterator.return?.(undefined);
    });
  });

  describe('boardPresenceStats', () => {
    it('counts distinct climbs and climbers from boardsesh_ticks for the board', async () => {
      const boardId = await (async () => {
        const resolved = await boardPresenceMutations.resolveBoardForSerial(
          undefined,
          { serial: `STATS-${Date.now()}`, boardType: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2' },
          authCtx(),
        );
        return resolved.boardId;
      })();

      // Two ticks, same climb + same user → distinct climbs = 1, climbers = 1.
      const climbedAt = new Date().toISOString();
      for (let i = 0; i < 2; i++) {
        await db.execute(sql`
          INSERT INTO boardsesh_ticks
            (uuid, user_id, board_type, climb_uuid, angle, is_mirror, status, attempt_count, is_benchmark, comment, climbed_at, created_at, updated_at, board_id)
          VALUES
            (${`tick-${Date.now()}-${i}`}, ${TEST_USER_ID}, 'kilter', ${TEST_CLIMB_UUID}, 40, false, 'send', 1, false, '', ${climbedAt}, now(), now(), ${boardId})
        `);
      }

      const stats = await boardPresenceQueries.boardPresenceStats(undefined, { boardId }, authCtx());
      expect(stats.climbsSentCount).toBe(1);
      expect(stats.distinctClimbersCount).toBe(1);
      expect(stats.lastSentAt).not.toBeNull();
      // ISO 8601 normalised.
      expect(stats.lastSentAt).toMatch(/T.*Z$/);
    });

    it('returns zeroes for a board with no ticks', async () => {
      const stats = await boardPresenceQueries.boardPresenceStats(undefined, { boardId: 999_999 }, authCtx());
      expect(stats.climbsSentCount).toBe(0);
      expect(stats.distinctClimbersCount).toBe(0);
      expect(stats.lastSentAt).toBeNull();
    });
  });
});
