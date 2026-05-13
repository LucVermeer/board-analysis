/**
 * Regression test for the multi-instance markInactive race in
 * `leaveSession`.
 *
 * Before this fix: when the local sessionsMap entry for a session emptied,
 * the instance unconditionally called `redisStore.markInactive(sessionId)`,
 * `writeScheduler.cancelPendingWrites(sessionId)`, and logged
 * "Session ... marked inactive - grace period started (60s)" — even though
 * other backend instances might still have active members. The cancelled
 * pending Postgres writes are the dangerous side-effect: a queue mutation
 * made just before the local instance emptied could be lost from durable
 * storage.
 *
 * After this fix: the side-effects are skipped when distributed state
 * still lists members on other instances. The local grace timer still runs
 * (it only manages this instance's memory).
 */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { leaveSession } from '../services/room-manager/client-lifecycle';
import type { ConnectedClient } from '../services/room-manager/types';
import type { RedisSessionStore } from '../services/redis-session-store';
import type { DistributedStateManager } from '../services/distributed-state';
import type { WriteScheduler } from '../services/room-manager/write-scheduler';

const GRACE_PERIOD_MS = 60_000;

type MockedRedisStore = Pick<RedisSessionStore, 'markInactive' | 'saveUsers'>;
type MockedWriteScheduler = Pick<WriteScheduler, 'cancelPendingWrites'>;
type MockedDistState = Pick<DistributedStateManager, 'leaveSession' | 'getSessionMembers'>;

function makeRedisStore(): MockedRedisStore {
  return {
    markInactive: vi.fn().mockResolvedValue(undefined),
    saveUsers: vi.fn().mockResolvedValue(undefined),
  };
}

function makeWriteScheduler(): MockedWriteScheduler {
  return {
    cancelPendingWrites: vi.fn(),
  };
}

function makeClient(connectionId: string, sessionId: string | null): ConnectedClient {
  return {
    connectionId,
    sessionId,
    userId: 'user-1',
    username: 'test',
    isLeader: false,
    connectedAt: new Date(),
    avatarUrl: undefined,
  };
}

describe('leaveSession multi-instance markInactive race', () => {
  let clients: Map<string, ConnectedClient>;
  let sessionsMap: Map<string, Set<string>>;
  let sessionGraceTimers: Map<string, NodeJS.Timeout>;
  let pendingJoinPersists: Map<string, Promise<void>>;
  let redisStore: MockedRedisStore;
  let writeScheduler: MockedWriteScheduler;

  const SESSION_ID = 'session-multi-instance';
  const LOCAL_CONN = 'conn-local';
  const REMOTE_CONN = 'conn-on-other-instance';

  beforeEach(() => {
    clients = new Map();
    sessionsMap = new Map();
    sessionGraceTimers = new Map();
    pendingJoinPersists = new Map();
    redisStore = makeRedisStore();
    writeScheduler = makeWriteScheduler();

    clients.set(LOCAL_CONN, makeClient(LOCAL_CONN, SESSION_ID));
    sessionsMap.set(SESSION_ID, new Set([LOCAL_CONN]));
  });

  it('skips markInactive and keeps pending writes when other instances still have members', async () => {
    const distributedState: MockedDistState = {
      leaveSession: vi.fn().mockResolvedValue({ newLeaderId: REMOTE_CONN }),
      getSessionMembers: vi.fn().mockResolvedValue([
        { id: LOCAL_CONN, username: 'a', isLeader: false },
        { id: REMOTE_CONN, username: 'b', isLeader: true },
      ]),
    };

    const result = await leaveSession(
      LOCAL_CONN,
      clients,
      sessionsMap,
      redisStore as unknown as RedisSessionStore,
      distributedState as unknown as DistributedStateManager,
      writeScheduler as unknown as WriteScheduler,
      sessionGraceTimers,
      pendingJoinPersists,
      GRACE_PERIOD_MS,
    );

    expect(result?.sessionId).toBe(SESSION_ID);
    expect(result?.newLeaderId).toBe(REMOTE_CONN);

    // The dangerous side-effects must be skipped because another instance
    // still has members.
    expect(writeScheduler.cancelPendingWrites).not.toHaveBeenCalled();
    expect(redisStore.markInactive).not.toHaveBeenCalled();

    // Local grace timer still runs (per-instance memory cleanup).
    expect(sessionGraceTimers.has(SESSION_ID)).toBe(true);
    clearTimeout(sessionGraceTimers.get(SESSION_ID)!);
  });

  it('still calls markInactive and cancels pending writes when no other instances have members', async () => {
    const distributedState: MockedDistState = {
      leaveSession: vi.fn().mockResolvedValue({ newLeaderId: null }),
      getSessionMembers: vi.fn().mockResolvedValue([
        // Only the leaving connection remains; nothing else globally.
        { id: LOCAL_CONN, username: 'a', isLeader: true },
      ]),
    };

    const result = await leaveSession(
      LOCAL_CONN,
      clients,
      sessionsMap,
      redisStore as unknown as RedisSessionStore,
      distributedState as unknown as DistributedStateManager,
      writeScheduler as unknown as WriteScheduler,
      sessionGraceTimers,
      pendingJoinPersists,
      GRACE_PERIOD_MS,
    );

    expect(result?.sessionId).toBe(SESSION_ID);
    expect(writeScheduler.cancelPendingWrites).toHaveBeenCalledWith(SESSION_ID);
    expect(redisStore.markInactive).toHaveBeenCalledWith(SESSION_ID);

    expect(sessionGraceTimers.has(SESSION_ID)).toBe(true);
    clearTimeout(sessionGraceTimers.get(SESSION_ID)!);
  });

  it('still calls markInactive when getSessionMembers returns an empty array (session already evicted)', async () => {
    // This documents the desired fallback when distributed state has
    // already pruned the leaving connection (e.g. TTL expired between
    // `leaveSession`'s callsite and the membership query). The race
    // result is that `members` is empty, which we treat the same as
    // "no other members" — mark inactive, cancel pending writes.
    const distributedState: MockedDistState = {
      leaveSession: vi.fn().mockResolvedValue({ newLeaderId: null }),
      getSessionMembers: vi.fn().mockResolvedValue([]),
    };

    await leaveSession(
      LOCAL_CONN,
      clients,
      sessionsMap,
      redisStore as unknown as RedisSessionStore,
      distributedState as unknown as DistributedStateManager,
      writeScheduler as unknown as WriteScheduler,
      sessionGraceTimers,
      pendingJoinPersists,
      GRACE_PERIOD_MS,
    );

    expect(distributedState.getSessionMembers).toHaveBeenCalledWith(SESSION_ID);
    expect(redisStore.markInactive).toHaveBeenCalledWith(SESSION_ID);
    expect(writeScheduler.cancelPendingWrites).toHaveBeenCalledWith(SESSION_ID);

    clearTimeout(sessionGraceTimers.get(SESSION_ID)!);
  });

  it('falls back to markInactive when distributedState is unavailable (single-instance dev mode)', async () => {
    const result = await leaveSession(
      LOCAL_CONN,
      clients,
      sessionsMap,
      redisStore as unknown as RedisSessionStore,
      null, // no distributed state
      writeScheduler as unknown as WriteScheduler,
      sessionGraceTimers,
      pendingJoinPersists,
      GRACE_PERIOD_MS,
    );

    expect(result?.sessionId).toBe(SESSION_ID);

    // Without distributed state we cannot check global membership, so the
    // legacy behaviour (mark inactive immediately) must remain.
    expect(redisStore.markInactive).toHaveBeenCalledWith(SESSION_ID);
    expect(writeScheduler.cancelPendingWrites).toHaveBeenCalledWith(SESSION_ID);
    expect(redisStore.saveUsers).toHaveBeenCalledWith(SESSION_ID, []);

    clearTimeout(sessionGraceTimers.get(SESSION_ID)!);
  });

  it('treats a failing distributed members query as "no other members" to avoid leaked sessions', async () => {
    const distributedState: MockedDistState = {
      leaveSession: vi.fn().mockResolvedValue({ newLeaderId: null }),
      getSessionMembers: vi.fn().mockRejectedValue(new Error('redis down')),
    };

    // Silence the expected console.error from the catch branch.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await leaveSession(
      LOCAL_CONN,
      clients,
      sessionsMap,
      redisStore as unknown as RedisSessionStore,
      distributedState as unknown as DistributedStateManager,
      writeScheduler as unknown as WriteScheduler,
      sessionGraceTimers,
      pendingJoinPersists,
      GRACE_PERIOD_MS,
    );

    expect(redisStore.markInactive).toHaveBeenCalledWith(SESSION_ID);
    expect(writeScheduler.cancelPendingWrites).toHaveBeenCalledWith(SESSION_ID);

    clearTimeout(sessionGraceTimers.get(SESSION_ID)!);
    errSpy.mockRestore();
  });
});
