/**
 * Regression tests for the multi-instance `markInactive` cleanup in
 * `leaveSession`.
 *
 * Before any of these fixes: when the local sessionsMap entry for a
 * session emptied, the instance unconditionally called
 * `redisStore.markInactive(sessionId)`,
 * `writeScheduler.cancelPendingWrites(sessionId)`, and logged
 * "Session ... marked inactive - grace period started (60s)" — even
 * though other backend instances might still have active members. The
 * cancelled pending Postgres writes are the dangerous side-effect: a
 * queue mutation made just before the local instance emptied could be
 * lost from durable storage.
 *
 * After the fix in this PR:
 * - We only mark inactive when the session is globally empty.
 * - The global-emptiness check runs AFTER `distributedState.leaveSession`
 *   so the two-instance concurrent-leave race can't leak — when both
 *   instances see [other] in a pre-leave snapshot, both leave, then both
 *   re-check post-leave and both see [] → both call markInactive
 *   idempotently. (`SREM` on the `boardsesh:session:active` set is a
 *   no-op the second time.) The single-instance-with-friend-on-other-
 *   instance case still works because the friend hasn't left yet, so
 *   the post-leave query returns `[friend]` not `[]`.
 * - The local grace timer still runs unconditionally (per-instance
 *   memory cleanup is independent of global session state).
 */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { leaveSession } from '../services/room-manager/client-lifecycle';
import type { ConnectedClient, LocalSessionParticipant } from '../services/room-manager/types';
import type { RedisSessionStore } from '../services/redis-session-store';
import type { DistributedStateManager } from '../services/distributed-state';
import type { WriteScheduler } from '../services/room-manager/write-scheduler';

const GRACE_PERIOD_MS = 60_000;

type MockedRedisStore = Pick<RedisSessionStore, 'markInactive' | 'saveUsers'>;
type MockedWriteScheduler = Pick<WriteScheduler, 'cancelPendingWrites'>;
type MockedDistState = Pick<DistributedStateManager, 'leaveSession' | 'getSessionMembers' | 'removeParticipant'>;

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
    participantId: connectionId,
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
  let sessionParticipants: Map<string, Map<string, LocalSessionParticipant>>;
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
    sessionParticipants = new Map();
    sessionGraceTimers = new Map();
    pendingJoinPersists = new Map();
    redisStore = makeRedisStore();
    writeScheduler = makeWriteScheduler();

    clients.set(LOCAL_CONN, makeClient(LOCAL_CONN, SESSION_ID));
    sessionsMap.set(SESSION_ID, new Set([LOCAL_CONN]));
    sessionParticipants.set(
      SESSION_ID,
      new Map([
        [
          LOCAL_CONN,
          {
            id: LOCAL_CONN,
            username: 'test',
            userId: 'user-1',
            avatarUrl: undefined,
            isLeader: false,
            connectionState: 'CONNECTED',
            connectionIds: new Set([LOCAL_CONN]),
          },
        ],
      ]),
    );
  });

  it('skips markInactive and keeps pending writes when other instances still have members', async () => {
    // Post-leave query: we already left, but the other instance's
    // connection is still in the membership set.
    const distributedState: MockedDistState = {
      leaveSession: vi.fn().mockResolvedValue({ newLeaderId: REMOTE_CONN }),
      getSessionMembers: vi.fn().mockResolvedValue([{ id: REMOTE_CONN, username: 'b', isLeader: true }]),
      removeParticipant: vi.fn().mockResolvedValue(undefined),
    };

    const result = await leaveSession(
      LOCAL_CONN,
      clients,
      sessionsMap,
      sessionParticipants,
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
    // Post-leave query returns empty because we were the only member
    // globally.
    const distributedState: MockedDistState = {
      leaveSession: vi.fn().mockResolvedValue({ newLeaderId: null }),
      getSessionMembers: vi.fn().mockResolvedValue([]),
      removeParticipant: vi.fn().mockResolvedValue(undefined),
    };

    const result = await leaveSession(
      LOCAL_CONN,
      clients,
      sessionsMap,
      sessionParticipants,
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

  it('queries getSessionMembers AFTER distributedState.leaveSession so the post-leave view collapses the concurrent-leave race', async () => {
    // Two-instance concurrent-leave race: both instances see [other] in
    // a *pre*-leave snapshot, both decide to skip markInactive, both
    // distributedState.leaveSession runs, then both re-check post-leave
    // and see []. With the call order baked in here, the cleanup fires
    // idempotently — `SREM boardsesh:session:active` is a no-op the
    // second time, so both instances calling markInactive is fine.
    const callOrder: string[] = [];
    const distributedState: MockedDistState = {
      leaveSession: vi.fn().mockImplementation(async () => {
        callOrder.push('leaveSession');
        return { newLeaderId: null };
      }),
      getSessionMembers: vi.fn().mockImplementation(async () => {
        callOrder.push('getSessionMembers');
        return [];
      }),
      removeParticipant: vi.fn().mockResolvedValue(undefined),
    };

    await leaveSession(
      LOCAL_CONN,
      clients,
      sessionsMap,
      sessionParticipants,
      redisStore as unknown as RedisSessionStore,
      distributedState as unknown as DistributedStateManager,
      writeScheduler as unknown as WriteScheduler,
      sessionGraceTimers,
      pendingJoinPersists,
      GRACE_PERIOD_MS,
    );

    expect(callOrder).toEqual(['leaveSession', 'getSessionMembers']);
    expect(redisStore.markInactive).toHaveBeenCalledWith(SESSION_ID);

    clearTimeout(sessionGraceTimers.get(SESSION_ID)!);
  });

  it('falls back to markInactive when distributedState is unavailable (single-instance dev mode)', async () => {
    const result = await leaveSession(
      LOCAL_CONN,
      clients,
      sessionsMap,
      sessionParticipants,
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
      removeParticipant: vi.fn().mockResolvedValue(undefined),
    };

    // Silence the expected console.error from the catch branch.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await leaveSession(
      LOCAL_CONN,
      clients,
      sessionsMap,
      sessionParticipants,
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
