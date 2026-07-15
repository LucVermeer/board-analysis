import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vite-plus/test';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'drizzle-orm';
import type {
  BoardPresenceClimb,
  BoardQueuePreview,
  ClimbQueueItem,
  ConnectionContext,
  QueueEvent,
  QueueState,
} from '@boardsesh/shared-schema';
import { db } from '../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { pubsub } from '../pubsub';
import { redisClientManager } from '../redis/client';
import {
  BOARD_QUEUE_PREVIEW_UP_NEXT_CAP,
  buildBoardQueuePreview,
  getBoardQueuePreviewSnapshot,
  publishBoardQueuePreviewForSession,
  registerBoardQueuePreviewHook,
  toBoardQueuePreviewItem,
} from '../services/board-queue-preview';
import {
  boardQueuePreviewQueries,
  boardQueuePreviewSubscriptions,
} from '../graphql/resolvers/board-presence/queue-preview';

const TEST_USER_ID = 'board-queue-preview-test-user';
const TEST_BOARD_PATH = 'queue-preview-test/1/10/1,2/40';
// Secret markers that must NEVER appear in a redacted preview payload.
const SECRET_USER_ID = 'super-secret-user-id';
const SECRET_USERNAME = 'Secret Climber Name';
const SECRET_AVATAR_URL = 'https://example.com/secret-avatar.jpg';

function authCtx(overrides: Partial<ConnectionContext> = {}): ConnectionContext {
  return {
    connectionId: `conn-${Math.random().toString(36).slice(2)}`,
    isAuthenticated: true,
    userId: TEST_USER_ID,
    ...overrides,
  } as ConnectionContext;
}

const anonCtx = () => authCtx({ isAuthenticated: false, userId: undefined });

function makeQueueItem(n: number, overrides: Partial<ClimbQueueItem> = {}): ClimbQueueItem {
  return {
    uuid: `queue-item-${n}`,
    climb: {
      uuid: `climb-${n}`,
      setter_username: `setter-${n}`,
      name: `Climb ${n}`,
      frames: `p${n}r12`,
      angle: 40,
      ascensionist_count: 3,
      difficulty: 'V5',
      quality_average: '4.0',
      stars: 4,
      difficulty_error: '0',
      benchmark_difficulty: null,
    },
    // User-identifying fields the redaction must strip.
    addedBy: SECRET_USER_ID,
    addedByUser: { id: SECRET_USER_ID, username: SECRET_USERNAME, avatarUrl: SECRET_AVATAR_URL },
    tickedBy: [SECRET_USER_ID],
    ...overrides,
  };
}

function makeQueueState(queue: ClimbQueueItem[], currentClimbQueueItem: ClimbQueueItem | null): QueueState {
  return { queue, currentClimbQueueItem, sequence: 1, stateHash: 'hash' };
}

function makePresenceClimb(): BoardPresenceClimb {
  return { climbUuid: 'presence-climb', sentAt: new Date().toISOString(), seq: 1 };
}

function makeQueueEvent(item: ClimbQueueItem): QueueEvent {
  return { __typename: 'QueueItemAdded', sequence: 1, stateHash: 'hash', item };
}

let boardSlugCounter = 0;
async function makeBoard({ isPublic }: { isPublic: boolean }): Promise<number> {
  const slug = `qp-board-${Date.now().toString(36)}-${boardSlugCounter++}`;
  const [row] = await db
    .insert(dbSchema.userBoards)
    .values({
      uuid: `uuid-${slug}`,
      slug,
      ownerId: TEST_USER_ID,
      boardType: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: '1,2',
      name: 'Queue Preview Wall',
      serialNumber: null,
      isPublic,
    })
    .returning({ id: dbSchema.userBoards.id });
  return Number(row.id);
}

async function makeSession({
  boardId,
  isPublic,
  status = 'active',
  lastActivity = new Date(),
}: {
  boardId: number | null;
  isPublic: boolean;
  status?: string;
  lastActivity?: Date;
}): Promise<string> {
  const sessionId = uuidv4();
  await db.insert(dbSchema.boardSessions).values({
    id: sessionId,
    boardPath: TEST_BOARD_PATH,
    status,
    isPublic,
    boardId,
    lastActivity,
  });
  return sessionId;
}

async function seedQueueState(
  sessionId: string,
  queue: ClimbQueueItem[],
  currentClimbQueueItem: ClimbQueueItem | null,
): Promise<void> {
  await db.insert(dbSchema.boardSessionQueues).values({
    sessionId,
    queue,
    currentClimbQueueItem,
    version: 1,
    sequence: 1,
  });
}

/** Bind session↔board the way reportBoardClimb does (local-mode maps here). */
async function bindSessionToBoard(sessionId: string, boardId: number): Promise<void> {
  await pubsub.commitBoardClimb({
    boardId: String(boardId),
    emitterId: TEST_USER_ID,
    climb: makePresenceClimb(),
    climbUuid: 'presence-climb',
    effectiveAngle: 40,
    sessionId,
  });
}

async function seedUser(): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, email, name, image, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'kiosk@board-queue-preview.test', 'Kiosk Tester', null, now(), now())
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
  `);
}

async function cleanup(): Promise<void> {
  // board_session_queues cascades from board_sessions.
  await db.execute(sql`DELETE FROM board_sessions WHERE board_path = ${TEST_BOARD_PATH}`);
  await db.execute(sql`DELETE FROM user_boards WHERE owner_id = ${TEST_USER_ID}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${TEST_USER_ID}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// Redaction (pure — no DB, no Redis)
// ============================================================
describe('board-queue-preview redaction', () => {
  const ALLOWED_ITEM_KEYS = ['angle', 'climbUuid', 'frames', 'grade', 'gradeColor', 'name', 'queueItemUuid', 'setter'];

  it('exposes ONLY climb-catalog fields on preview items — no user-identifying keys', () => {
    const item = toBoardQueuePreviewItem(makeQueueItem(1));

    expect(Object.keys(item).sort()).toEqual(ALLOWED_ITEM_KEYS);
    expect(item).toEqual({
      queueItemUuid: 'queue-item-1',
      climbUuid: 'climb-1',
      name: 'Climb 1',
      grade: 'V5',
      gradeColor: null,
      frames: 'p1r12',
      angle: 40,
      setter: 'setter-1',
    });
  });

  it('never leaks addedBy/addedByUser/tickedBy or their values anywhere in the preview', () => {
    const queue = [makeQueueItem(1), makeQueueItem(2), makeQueueItem(3)];
    const preview = buildBoardQueuePreview(42, makeQueueState(queue, queue[0]));

    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain('addedBy');
    expect(serialized).not.toContain('addedByUser');
    expect(serialized).not.toContain('tickedBy');
    expect(serialized).not.toContain('avatarUrl');
    expect(serialized).not.toContain(SECRET_USER_ID);
    expect(serialized).not.toContain(SECRET_USERNAME);
    expect(serialized).not.toContain(SECRET_AVATAR_URL);

    for (const previewItem of [preview.current!, ...preview.upNext]) {
      expect(Object.keys(previewItem).sort()).toEqual(ALLOWED_ITEM_KEYS);
    }
  });

  it('slices upNext to the items after the current one and reports the uncapped queueLength', () => {
    const queue = Array.from({ length: 15 }, (_, index) => makeQueueItem(index));
    const preview = buildBoardQueuePreview(42, makeQueueState(queue, queue[2]));

    expect(preview.boardId).toBe(42);
    expect(preview.current?.queueItemUuid).toBe('queue-item-2');
    expect(preview.upNext).toHaveLength(BOARD_QUEUE_PREVIEW_UP_NEXT_CAP);
    expect(preview.upNext[0].queueItemUuid).toBe('queue-item-3');
    expect(preview.upNext[BOARD_QUEUE_PREVIEW_UP_NEXT_CAP - 1].queueItemUuid).toBe(
      `queue-item-${2 + BOARD_QUEUE_PREVIEW_UP_NEXT_CAP}`,
    );
    expect(preview.queueLength).toBe(15);
    expect(Date.parse(preview.updatedAt)).not.toBeNaN();
  });

  it('starts upNext at the queue head when there is no current item (or it is not in the queue)', () => {
    const queue = [makeQueueItem(1), makeQueueItem(2)];

    const noCurrent = buildBoardQueuePreview(42, makeQueueState(queue, null));
    expect(noCurrent.current).toBeNull();
    expect(noCurrent.upNext.map((item) => item.queueItemUuid)).toEqual(['queue-item-1', 'queue-item-2']);

    const detachedCurrent = buildBoardQueuePreview(42, makeQueueState(queue, makeQueueItem(99)));
    expect(detachedCurrent.current?.queueItemUuid).toBe('queue-item-99');
    expect(detachedCurrent.upNext.map((item) => item.queueItemUuid)).toEqual(['queue-item-1', 'queue-item-2']);
  });
});

// ============================================================
// Binding (local / Redis-less fallback maps) + DB fallback
// ============================================================
describe('board-queue-preview binding', () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('commitBoardClimb records the session↔board binding both ways (local fallback)', async () => {
    const boardId = await makeBoard({ isPublic: true });
    const sessionId = await makeSession({ boardId, isPublic: true });

    await bindSessionToBoard(sessionId, boardId);

    expect(await pubsub.getSessionBoard(sessionId)).toBe(String(boardId));
    expect(await pubsub.getBoardSession(String(boardId))).toBe(sessionId);
  });

  it('falls back to the newest active public board_sessions row when no live binding exists', async () => {
    const boardId = await makeBoard({ isPublic: true });
    // Older public session, newer public session, and a newest-but-private one
    // (which must NOT be picked over the newest public session).
    const olderSessionId = await makeSession({
      boardId,
      isPublic: true,
      lastActivity: new Date(Date.now() - 60_000),
    });
    const newerSessionId = await makeSession({ boardId, isPublic: true, lastActivity: new Date() });
    await makeSession({ boardId, isPublic: false, lastActivity: new Date(Date.now() + 60_000) });

    const queue = [makeQueueItem(1), makeQueueItem(2)];
    await seedQueueState(newerSessionId, queue, queue[0]);
    await seedQueueState(olderSessionId, [makeQueueItem(9)], null);

    const preview = await boardQueuePreviewQueries.boardQueuePreview(undefined, { boardId }, anonCtx());
    expect(preview).not.toBeNull();
    expect(preview!.current?.queueItemUuid).toBe('queue-item-1');
    expect(preview!.upNext.map((item) => item.queueItemUuid)).toEqual(['queue-item-2']);
    expect(preview!.queueLength).toBe(2);
  });

  it('ended sessions are not previewable through the DB fallback', async () => {
    const boardId = await makeBoard({ isPublic: true });
    const sessionId = await makeSession({ boardId, isPublic: true, status: 'ended' });
    await seedQueueState(sessionId, [makeQueueItem(1)], null);

    expect(await boardQueuePreviewQueries.boardQueuePreview(undefined, { boardId }, anonCtx())).toBeNull();
  });
});

// ============================================================
// Privacy gates
// ============================================================
describe('board-queue-preview privacy gates', () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('public board + public session → data flows to an anonymous viewer', async () => {
    const boardId = await makeBoard({ isPublic: true });
    const sessionId = await makeSession({ boardId, isPublic: true });
    const queue = [makeQueueItem(1), makeQueueItem(2), makeQueueItem(3)];
    await seedQueueState(sessionId, queue, queue[0]);
    await bindSessionToBoard(sessionId, boardId);

    const preview = await boardQueuePreviewQueries.boardQueuePreview(undefined, { boardId }, anonCtx());
    expect(preview).not.toBeNull();
    expect(preview!.boardId).toBe(boardId);
    expect(preview!.current?.climbUuid).toBe('climb-1');
    expect(preview!.upNext).toHaveLength(2);
    expect(JSON.stringify(preview)).not.toContain(SECRET_USER_ID);
  });

  it('is_public=false bound session → query returns null and the producer publishes nothing', async () => {
    const boardId = await makeBoard({ isPublic: true });
    const sessionId = await makeSession({ boardId, isPublic: false });
    await seedQueueState(sessionId, [makeQueueItem(1)], null);
    await bindSessionToBoard(sessionId, boardId);

    expect(await boardQueuePreviewQueries.boardQueuePreview(undefined, { boardId }, anonCtx())).toBeNull();

    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));
    await publishBoardQueuePreviewForSession(sessionId);
    expect(received).toHaveLength(0);
    unsubscribe();
  });

  it('private board → NOT_FOUND for anonymous viewers (query and subscription), null for logged-in', async () => {
    const boardId = await makeBoard({ isPublic: false });
    const sessionId = await makeSession({ boardId, isPublic: true });
    await seedQueueState(sessionId, [makeQueueItem(1)], null);
    await bindSessionToBoard(sessionId, boardId);

    await expect(boardQueuePreviewQueries.boardQueuePreview(undefined, { boardId }, anonCtx())).rejects.toThrow(
      'Board not found',
    );

    const iterator = boardQueuePreviewSubscriptions.boardQueuePreview.subscribe(undefined, { boardId }, anonCtx());
    await expect(iterator.next()).rejects.toThrow('Board not found');
    await iterator.return?.(undefined);

    // Both preview gates are viewer-independent: a logged-in viewer of a
    // private board gets null (no preview exists), not the session's queue —
    // the producer would never publish for this board either.
    expect(await boardQueuePreviewQueries.boardQueuePreview(undefined, { boardId }, authCtx())).toBeNull();

    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));
    await publishBoardQueuePreviewForSession(sessionId);
    expect(received).toHaveLength(0);
    unsubscribe();
  });

  it('returns null when no session is bound to the board at all', async () => {
    const boardId = await makeBoard({ isPublic: true });
    expect(await boardQueuePreviewQueries.boardQueuePreview(undefined, { boardId }, anonCtx())).toBeNull();
    expect(await getBoardQueuePreviewSnapshot(boardId)).toBeNull();
  });

  it('does not publish for a session whose board binding was superseded by another session', async () => {
    const boardId = await makeBoard({ isPublic: true });
    const firstSessionId = await makeSession({ boardId, isPublic: true });
    const secondSessionId = await makeSession({ boardId, isPublic: true });
    await seedQueueState(firstSessionId, [makeQueueItem(1)], null);
    await seedQueueState(secondSessionId, [makeQueueItem(2)], null);

    await bindSessionToBoard(firstSessionId, boardId);
    // The wall moves on: a send from the second session re-binds the board.
    await bindSessionToBoard(secondSessionId, boardId);

    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));

    // The superseded session's producer path must not clobber the preview.
    await publishBoardQueuePreviewForSession(firstSessionId);
    expect(received).toHaveLength(0);

    await publishBoardQueuePreviewForSession(secondSessionId);
    expect(received).toHaveLength(1);
    expect(received[0].upNext.map((item) => item.queueItemUuid)).toEqual(['queue-item-2']);
    unsubscribe();
  });
});

// ============================================================
// Live producer: debounce + hook coexistence + subscription seed
// ============================================================
describe('board-queue-preview live producer', () => {
  const DEBOUNCE_MS = 25;

  beforeEach(async () => {
    await cleanup();
    await seedUser();
  });

  afterEach(async () => {
    await cleanup();
  });

  async function makePreviewableSession(): Promise<{ boardId: number; sessionId: string }> {
    const boardId = await makeBoard({ isPublic: true });
    const sessionId = await makeSession({ boardId, isPublic: true });
    const queue = [makeQueueItem(1), makeQueueItem(2)];
    await seedQueueState(sessionId, queue, queue[0]);
    await bindSessionToBoard(sessionId, boardId);
    return { boardId, sessionId };
  }

  it('a burst of queue mutations triggers exactly one publish after the debounce', async () => {
    const { boardId, sessionId } = await makePreviewableSession();
    const unregister = registerBoardQueuePreviewHook({ debounceMs: DEBOUNCE_MS });
    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));

    try {
      pubsub.publishQueueEvent(sessionId, makeQueueEvent(makeQueueItem(3)));
      pubsub.publishQueueEvent(sessionId, makeQueueEvent(makeQueueItem(4)));
      pubsub.publishQueueEvent(sessionId, makeQueueEvent(makeQueueItem(5)));

      await sleep(DEBOUNCE_MS * 6);

      expect(received).toHaveLength(1);
      expect(received[0].boardId).toBe(boardId);
      expect(received[0].current?.queueItemUuid).toBe('queue-item-1');
      expect(received[0].upNext.map((item) => item.queueItemUuid)).toEqual(['queue-item-2']);
      expect(JSON.stringify(received)).not.toContain(SECRET_USER_ID);
    } finally {
      unsubscribe();
      unregister();
    }
  });

  it('skips PlaybackStateChanged events entirely', async () => {
    const { boardId, sessionId } = await makePreviewableSession();
    const unregister = registerBoardQueuePreviewHook({ debounceMs: DEBOUNCE_MS });
    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));

    try {
      pubsub.publishQueueEvent(sessionId, {
        __typename: 'PlaybackStateChanged',
        sequence: 1,
        climbUuid: 'climb-1',
        frameIndex: 0,
        isPlaying: true,
        speed: 1,
        paceMs: 500,
        anchorTimestamp: new Date().toISOString(),
        clientId: null,
      });

      await sleep(DEBOUNCE_MS * 6);
      expect(received).toHaveLength(0);
    } finally {
      unsubscribe();
      unregister();
    }
  });

  it('coexists with another queue-event hook: both fire on one event', async () => {
    const { boardId, sessionId } = await makePreviewableSession();

    // Stand-in for the APNs hook wired in server.ts (same registration API).
    const apnsStyleHookCalls: Array<{ sessionId: string; typename: string }> = [];
    const removeApnsStyleHook = pubsub.addQueueEventHook((hookSessionId, event) => {
      apnsStyleHookCalls.push({ sessionId: hookSessionId, typename: event.__typename });
    });
    const unregister = registerBoardQueuePreviewHook({ debounceMs: DEBOUNCE_MS });
    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));

    try {
      pubsub.publishQueueEvent(sessionId, makeQueueEvent(makeQueueItem(3)));
      await sleep(DEBOUNCE_MS * 6);

      // Both hooks observed the same single event.
      expect(apnsStyleHookCalls).toEqual([{ sessionId, typename: 'QueueItemAdded' }]);
      expect(received).toHaveLength(1);

      // Removal is per-hook: dropping the APNs-style hook leaves the producer wired.
      removeApnsStyleHook();
      pubsub.publishQueueEvent(sessionId, makeQueueEvent(makeQueueItem(4)));
      await sleep(DEBOUNCE_MS * 6);
      expect(apnsStyleHookCalls).toHaveLength(1);
      expect(received).toHaveLength(2);
    } finally {
      unsubscribe();
      unregister();
      removeApnsStyleHook();
    }
  });

  it('unregistering the producer cancels pending debounce timers (no publish after removal)', async () => {
    const { boardId, sessionId } = await makePreviewableSession();
    const unregister = registerBoardQueuePreviewHook({ debounceMs: DEBOUNCE_MS });
    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));

    try {
      pubsub.publishQueueEvent(sessionId, makeQueueEvent(makeQueueItem(3)));
      unregister();
      await sleep(DEBOUNCE_MS * 6);
      expect(received).toHaveLength(0);
    } finally {
      unsubscribe();
      unregister();
    }
  });

  it('subscription is seeded with the current snapshot, then streams producer publishes', async () => {
    const { boardId, sessionId } = await makePreviewableSession();
    const unregister = registerBoardQueuePreviewHook({ debounceMs: DEBOUNCE_MS });
    const iterator = boardQueuePreviewSubscriptions.boardQueuePreview.subscribe(undefined, { boardId }, anonCtx());

    try {
      const seedResult = await iterator.next();
      expect(seedResult.done).toBe(false);
      const seed = (seedResult.value as { boardQueuePreview: BoardQueuePreview }).boardQueuePreview;
      expect(seed.boardId).toBe(boardId);
      expect(seed.current?.queueItemUuid).toBe('queue-item-1');
      expect(JSON.stringify(seed)).not.toContain(SECRET_USER_ID);

      const nextPromise = iterator.next();
      pubsub.publishQueueEvent(sessionId, makeQueueEvent(makeQueueItem(3)));
      const liveResult = await nextPromise;
      expect(liveResult.done).toBe(false);
      const live = (liveResult.value as { boardQueuePreview: BoardQueuePreview }).boardQueuePreview;
      expect(live.boardId).toBe(boardId);
      expect(live.upNext.map((item) => item.queueItemUuid)).toEqual(['queue-item-2']);
    } finally {
      await iterator.return?.(undefined);
      unregister();
    }
  });
});

// ============================================================
// Redis-backed binding (reverse key written in the commit pipeline).
// pubsub connects only when Redis is reachable (CI configures it); skip
// cleanly otherwise, mirroring board-presence.test.ts.
// ============================================================
describe('board-queue-preview Redis binding', () => {
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
  let redisOn = false;
  let inspectionRedis: Redis | null = null;

  beforeAll(async () => {
    await pubsub.initialize().catch(() => {});
    redisOn = pubsub.isRedisConnected();
    if (!redisOn) {
      console.warn('[board-queue-preview] pubsub Redis unavailable — skipping Redis binding tests');
      return;
    }
    inspectionRedis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await inspectionRedis.connect();
    } catch {
      redisOn = false;
    }
  });

  afterAll(async () => {
    if (inspectionRedis) await inspectionRedis.quit().catch(() => {});
    if (pubsub.isRedisConnected()) await redisClientManager.disconnect().catch(() => {});
  });

  it('commitBoardClimb writes the reverse board→session key with a TTL in the same pipeline', async () => {
    if (!redisOn || !inspectionRedis) return;
    const boardId = `redis-binding-board-${Date.now()}`;
    const sessionId = `redis-binding-session-${Date.now()}`;

    await pubsub.commitBoardClimb({
      boardId,
      emitterId: TEST_USER_ID,
      climb: makePresenceClimb(),
      climbUuid: 'presence-climb',
      effectiveAngle: 40,
      sessionId,
    });

    try {
      expect(await pubsub.getSessionBoard(sessionId)).toBe(boardId);
      expect(await pubsub.getBoardSession(boardId)).toBe(sessionId);

      // Both binding keys carry the proof-of-presence TTL (12h) so an idle
      // binding expires rather than leaking forever.
      const reverseTtl = await inspectionRedis.ttl(`board:${boardId}:session`);
      const forwardTtl = await inspectionRedis.ttl(`session:${sessionId}:board`);
      expect(reverseTtl).toBeGreaterThan(0);
      expect(reverseTtl).toBeLessThanOrEqual(43_200);
      expect(forwardTtl).toBeGreaterThan(0);
    } finally {
      await inspectionRedis.del(
        `board:${boardId}:session`,
        `session:${sessionId}:board`,
        `board:${boardId}:history`,
        `board:${boardId}:writer`,
        `board:${boardId}:lastReport`,
      );
    }
  });

  it('getBoardSession returns null for an unbound board', async () => {
    if (!redisOn) return;
    expect(await pubsub.getBoardSession(`never-bound-${Date.now()}`)).toBeNull();
  });
});
