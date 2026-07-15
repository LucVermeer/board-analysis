import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vite-plus/test';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { eq, sql } from 'drizzle-orm';
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
  publishBoardQueuePreviewTombstoneForSession,
  registerBoardQueuePreviewHook,
  toBoardQueuePreviewItem,
} from '../services/board-queue-preview';
import {
  boardQueuePreviewQueries,
  boardQueuePreviewSubscriptions,
} from '../graphql/resolvers/board-presence/queue-preview';
import { SYSTEM_BOARD_OWNER_ID } from '../graphql/resolvers/board-presence/shared';
import { roomManager } from '../services/room-manager';

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
async function makeBoard({
  isPublic,
  ownerId = TEST_USER_ID,
}: {
  isPublic: boolean;
  ownerId?: string;
}): Promise<number> {
  const slug = `qp-board-${Date.now().toString(36)}-${boardSlugCounter++}`;
  const [row] = await db
    .insert(dbSchema.userBoards)
    .values({
      uuid: `uuid-${slug}`,
      slug,
      ownerId,
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

/** The system board owner (`shared.ts#ensureSystemBoardOwner` equivalent for tests). */
async function seedSystemBoardOwner(): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, email, name, created_at, updated_at)
    VALUES (${SYSTEM_BOARD_OWNER_ID}, 'system@boardsesh.com', 'Boardsesh', now(), now())
    ON CONFLICT DO NOTHING
  `);
}

async function cleanup(): Promise<void> {
  // board_session_queues cascades from board_sessions.
  await db.execute(sql`DELETE FROM board_sessions WHERE board_path = ${TEST_BOARD_PATH}`);
  // Slug-scoped so it also covers system-owned boards created by makeBoard
  // (the shared system user row itself is left in place).
  await db.execute(sql`DELETE FROM user_boards WHERE owner_id = ${TEST_USER_ID} OR slug LIKE 'qp-board-%'`);
  await db.execute(sql`DELETE FROM users WHERE id = ${TEST_USER_ID}`);
}

/** A public board with a public, active, queue-seeded session bound to it. */
async function makePreviewableSession(): Promise<{ boardId: number; sessionId: string }> {
  const boardId = await makeBoard({ isPublic: true });
  const sessionId = await makeSession({ boardId, isPublic: true });
  const queue = [makeQueueItem(1), makeQueueItem(2)];
  await seedQueueState(sessionId, queue, queue[0]);
  await bindSessionToBoard(sessionId, boardId);
  return { boardId, sessionId };
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

  it('a live-bound session that fails the gates never falls through to the DB fallback', async () => {
    const boardId = await makeBoard({ isPublic: true });
    // An older public active session with a seeded queue exists in the DB…
    const olderPublicSessionId = await makeSession({
      boardId,
      isPublic: true,
      lastActivity: new Date(Date.now() - 60_000),
    });
    await seedQueueState(olderPublicSessionId, [makeQueueItem(1)], null);
    // …but the LIVE binding points at a private session that currently holds
    // the wall.
    const privateSessionId = await makeSession({ boardId, isPublic: false });
    await seedQueueState(privateSessionId, [makeQueueItem(2)], null);
    await bindSessionToBoard(privateSessionId, boardId);

    // A regression that fell through to the DB fallback would surface the
    // older public session's queue while the private session is on the wall —
    // the wrong session's queue, on a public display.
    expect(await boardQueuePreviewQueries.boardQueuePreview(undefined, { boardId }, anonCtx())).toBeNull();
    expect(await getBoardQueuePreviewSnapshot(boardId)).toBeNull();
  });

  it('a live-bound session that has already ended yields null', async () => {
    const boardId = await makeBoard({ isPublic: true });
    const endedSessionId = await makeSession({ boardId, isPublic: true, status: 'ended' });
    await seedQueueState(endedSessionId, [makeQueueItem(1)], null);
    await bindSessionToBoard(endedSessionId, boardId);

    expect(await boardQueuePreviewQueries.boardQueuePreview(undefined, { boardId }, anonCtx())).toBeNull();
  });

  it('system-owned non-public shared boards pass the anon gate (system allowance branch)', async () => {
    await seedSystemBoardOwner();
    const boardId = await makeBoard({ isPublic: false, ownerId: SYSTEM_BOARD_OWNER_ID });
    const sessionId = await makeSession({ boardId, isPublic: true });
    const queue = [makeQueueItem(1), makeQueueItem(2)];
    await seedQueueState(sessionId, queue, queue[0]);
    await bindSessionToBoard(sessionId, boardId);

    // isPublic=false, but the system owner marks it a shared per-config feed —
    // anon-readable, so the preview flows (and the anon gate does not throw).
    const preview = await boardQueuePreviewQueries.boardQueuePreview(undefined, { boardId }, anonCtx());
    expect(preview).not.toBeNull();
    expect(preview!.current?.climbUuid).toBe('climb-1');
    expect(JSON.stringify(preview)).not.toContain(SECRET_USER_ID);
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

  it('a disconnect while the seed is still being computed does not leak the channel subscription', async () => {
    const { boardId } = await makePreviewableSession();
    const boardKey = String(boardId);
    expect(pubsub.getBoardQueuePreviewSubscriberCount(boardKey)).toBe(0);

    const iterator = boardQueuePreviewSubscriptions.boardQueuePreview.subscribe(undefined, { boardId }, anonCtx());
    // Start the generator: it eagerly subscribes to the channel, then awaits
    // the seed snapshot (DB work).
    const nextPromise = iterator.next();
    // Queue `.return()` immediately — async-generator requests are processed
    // in order, so this deterministically lands while the first step (which
    // includes the seed computation) is still running: exactly what
    // graphql-ws does when the client disconnects during setup. The queued
    // return completes at the seed yield, BEFORE the streaming loop starts —
    // without the resolver's finally-cleanup, the eager iterator would never
    // be closed and the channel subscription would leak permanently.
    const returnPromise = iterator.return?.(undefined);

    const [seedResult, returnResult] = await Promise.all([nextPromise, returnPromise]);
    // The in-flight seed still resolves the pending next()…
    expect(seedResult.done).toBe(false);
    expect(returnResult?.done).toBe(true);
    // …but the generator must have unsubscribed on its way out.
    expect(pubsub.getBoardQueuePreviewSubscriberCount(boardKey)).toBe(0);
  });
});

// ============================================================
// Tombstone: a session that stops being previewable clears public kiosks
// with an EMPTY snapshot (the producer only re-gates on queue events, so
// without this the last snapshot would linger indefinitely).
// ============================================================
describe('board-queue-preview tombstone', () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser();
  });

  afterEach(async () => {
    await cleanup();
  });

  const EMPTY_PREVIEW_SHAPE = { current: null, upNext: [], queueLength: 0 };

  it('ending the bound session publishes an empty snapshot to the board channel', async () => {
    const { boardId, sessionId } = await makePreviewableSession();
    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));

    try {
      // The same path the explicit endSession mutation takes.
      await roomManager.endSession(sessionId);

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ boardId, ...EMPTY_PREVIEW_SHAPE });
      expect(Date.parse(received[0].updatedAt)).not.toBeNaN();
    } finally {
      unsubscribe();
    }
  });

  it('a session flipping to private publishes an empty snapshot (contract for future is_public mutations)', async () => {
    const { boardId, sessionId } = await makePreviewableSession();
    // No mutation flips board_sessions.is_public today; simulate the flip and
    // exercise the tombstone call such a mutation must make.
    await db.update(dbSchema.boardSessions).set({ isPublic: false }).where(eq(dbSchema.boardSessions.id, sessionId));

    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));

    try {
      await publishBoardQueuePreviewTombstoneForSession(sessionId);

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ boardId, ...EMPTY_PREVIEW_SHAPE });
    } finally {
      unsubscribe();
    }
  });

  it('does not tombstone when a different session has since taken over the binding', async () => {
    const boardId = await makeBoard({ isPublic: true });
    const supersededSessionId = await makeSession({ boardId, isPublic: true });
    const currentSessionId = await makeSession({ boardId, isPublic: true });
    await seedQueueState(currentSessionId, [makeQueueItem(1)], null);

    await bindSessionToBoard(supersededSessionId, boardId);
    // The wall moves on: the second session re-binds the board.
    await bindSessionToBoard(currentSessionId, boardId);

    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));

    try {
      // Ending the superseded session must NOT clobber the preview owned by
      // the session actually on the wall.
      await roomManager.endSession(supersededSessionId);
      expect(received).toHaveLength(0);

      // The current session's queue still previews normally afterwards.
      await publishBoardQueuePreviewForSession(currentSessionId);
      expect(received).toHaveLength(1);
      expect(received[0].upNext.map((item) => item.queueItemUuid)).toEqual(['queue-item-1']);
    } finally {
      unsubscribe();
    }
  });

  it('does not tombstone a session that is still publicly previewable (misplaced-call guard)', async () => {
    const { boardId, sessionId } = await makePreviewableSession();
    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));

    try {
      await publishBoardQueuePreviewTombstoneForSession(sessionId);
      expect(received).toHaveLength(0);
    } finally {
      unsubscribe();
    }
  });

  it('does not tombstone on a board that is not anon-readable', async () => {
    const boardId = await makeBoard({ isPublic: false });
    const sessionId = await makeSession({ boardId, isPublic: true });
    await seedQueueState(sessionId, [makeQueueItem(1)], null);
    await bindSessionToBoard(sessionId, boardId);

    const received: BoardQueuePreview[] = [];
    const unsubscribe = await pubsub.subscribeBoardQueuePreview(String(boardId), (preview) => received.push(preview));

    try {
      // The producer never published for this private board, so there is
      // nothing to clear — and even an empty publish would leak "a session
      // just ended here" timing on the private board's channel.
      await roomManager.endSession(sessionId);
      expect(received).toHaveLength(0);
    } finally {
      unsubscribe();
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
