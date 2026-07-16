/**
 * Orchestration tests for the room-manager side of the #2135 atomic
 * reconnect/expiry wiring. The Lua-level behaviour is covered against real
 * Redis in `session-reconnect-atomicity.test.ts`; here we mock the distributed
 * state and assert that `disconnectClient` forwards the atomic results
 * correctly: skipping the RECONNECTING presence broadcast when a reconnect
 * already landed, and firing `onParticipantExpired` with the elected leader
 * when the grace timer evicts a leader ghost.
 */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { disconnectClient, type ExpiredParticipantLeader } from '../services/room-manager/client-lifecycle';
import type { ConnectedClient, LocalSessionParticipant, RoomManagerDeps } from '../services/room-manager/types';
import type { RedisSessionStore } from '../services/redis-session-store';
import type { DistributedStateManager } from '../services/distributed-state';
import type { WriteScheduler } from '../services/room-manager/write-scheduler';

type MockedDistState = Pick<
  DistributedStateManager,
  | 'removeConnection'
  | 'getSessionMemberCount'
  | 'markParticipantReconnectingIfIdle'
  | 'evictGhostParticipant'
  | 'getConnection'
>;

const SESSION_ID = 'sess-orchestration';
const CONN = 'conn-auth';
const USER = 'user-auth';

describe('disconnectClient reconnect/expiry orchestration (#2135)', () => {
  let clients: Map<string, ConnectedClient>;
  let sessionsMap: Map<string, Set<string>>;
  let sessionParticipants: Map<string, Map<string, LocalSessionParticipant>>;
  let sessionGraceTimers: Map<string, NodeJS.Timeout>;

  function makeDeps(distributedState: MockedDistState, graceMs: number): RoomManagerDeps {
    return {
      clients,
      sessions: sessionsMap,
      sessionParticipants,
      redisStore: { markInactive: vi.fn().mockResolvedValue(undefined) } as unknown as RedisSessionStore,
      distributedState: distributedState as unknown as DistributedStateManager,
      writeScheduler: { cancelPendingWrites: vi.fn() } as unknown as WriteScheduler,
      sessionGraceTimers,
      pendingJoinPersists: new Map(),
      sessionGracePeriodMs: graceMs,
    };
  }

  beforeEach(() => {
    clients = new Map();
    sessionsMap = new Map();
    sessionParticipants = new Map();
    sessionGraceTimers = new Map();

    clients.set(CONN, {
      connectionId: CONN,
      sessionId: SESSION_ID,
      participantId: USER,
      userId: USER,
      username: 'Auth',
      isLeader: false,
      connectedAt: new Date(),
      avatarUrl: undefined,
    });
    sessionsMap.set(SESSION_ID, new Set([CONN]));
    sessionParticipants.set(
      SESSION_ID,
      new Map([
        [
          USER,
          {
            id: USER,
            username: 'Auth',
            userId: USER,
            avatarUrl: undefined,
            isLeader: false,
            connectionState: 'CONNECTED',
            connectionIds: new Set([CONN]),
          },
        ],
      ]),
    );
  });

  it('skips the RECONNECTING presence broadcast when a reconnect already landed (crit D)', async () => {
    const distributedState: MockedDistState = {
      removeConnection: vi.fn().mockResolvedValue({
        sessionId: SESSION_ID,
        participantId: USER,
        wasLeader: false,
        newLeaderId: null,
        newLeaderParticipantId: null,
        remainingParticipantConnections: 0,
      }),
      getSessionMemberCount: vi.fn().mockResolvedValue(1),
      markParticipantReconnectingIfIdle: vi.fn().mockResolvedValue({ status: 'has-live' }),
      evictGhostParticipant: vi.fn(),
      getConnection: vi.fn(),
    };

    const onExpired = vi.fn();
    const result = await disconnectClient(makeDeps(distributedState, 60_000), CONN, onExpired);

    expect(distributedState.markParticipantReconnectingIfIdle).toHaveBeenCalledWith(SESSION_ID, USER);
    // No presence event owed, and no grace timer armed for a live participant.
    expect(result?.presenceUser).toBeUndefined();
    expect(sessionParticipants.get(SESSION_ID)?.get(USER)?.reconnectTimer).toBeUndefined();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('emits a RECONNECTING presence and, on grace expiry, fires onParticipantExpired with the elected leader', async () => {
    // A replacement leader connection lives locally so resolveLeaderParticipantId
    // maps the elected connectionId back to its stable participantId.
    clients.set('new-conn', {
      connectionId: 'new-conn',
      sessionId: SESSION_ID,
      participantId: 'new-participant',
      userId: 'new-participant',
      username: 'Next',
      isLeader: false,
      connectedAt: new Date(),
      avatarUrl: undefined,
    });

    const distributedState: MockedDistState = {
      removeConnection: vi.fn().mockResolvedValue({
        sessionId: SESSION_ID,
        participantId: USER,
        wasLeader: false,
        newLeaderId: null,
        newLeaderParticipantId: null,
        remainingParticipantConnections: 0,
      }),
      getSessionMemberCount: vi.fn().mockResolvedValue(1),
      markParticipantReconnectingIfIdle: vi.fn().mockResolvedValue({
        status: 'reconnecting',
        user: {
          id: USER,
          username: 'Auth',
          isLeader: false,
          avatarUrl: undefined,
          userId: USER,
          connectionState: 'RECONNECTING',
        },
      }),
      evictGhostParticipant: vi.fn().mockResolvedValue({ status: 'evicted', newLeaderId: 'new-conn' }),
      getConnection: vi.fn(),
    };

    let resolveExpired: (leader?: ExpiredParticipantLeader) => void;
    const expiredFired = new Promise<ExpiredParticipantLeader | undefined>((resolve) => {
      resolveExpired = resolve;
    });
    const onExpired = vi.fn((_sessionId: string, _participantId: string, newLeader?: ExpiredParticipantLeader) => {
      resolveExpired(newLeader);
    });

    const result = await disconnectClient(makeDeps(distributedState, 10), CONN, onExpired);
    // Passive disconnect parks the participant as RECONNECTING for peers.
    expect(result?.presenceUser?.connectionState).toBe('RECONNECTING');

    const newLeader = await Promise.race([
      expiredFired,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('grace timer never fired')), 2000)),
    ]);

    expect(distributedState.evictGhostParticipant).toHaveBeenCalledWith(SESSION_ID, USER);
    expect(onExpired).toHaveBeenCalledWith(SESSION_ID, USER, {
      leaderId: 'new-participant',
      leaderConnectionId: 'new-conn',
    });
    expect(newLeader).toEqual({ leaderId: 'new-participant', leaderConnectionId: 'new-conn' });
  });
});
