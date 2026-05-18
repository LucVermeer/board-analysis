/**
 * Tests for the `confirmClimbOnWall` and `setSessionBoardSerial` mutations
 * introduced by the simplified queue-control-bar pivot
 * (docs/queue-control-bar-pivot.md). Both follow the same pattern as the
 * Phase 2 PR1 take/release-control mutations.
 *
 * Behaviors verified:
 *
 *  confirmClimbOnWall
 *  - Server stamps `confirmedAt` (clients cannot forge it) and derives
 *    `confirmedByParticipantId` from the caller's identity.
 *  - Publishes a `WallConfirmedClimb` event with the climb UUID + caller's
 *    participant ID to all session members.
 *  - Any session participant may call (no driver requirement); non-members
 *    are rejected by the membership check.
 *  - Falls back to connectionId when ctx.participantId is missing (anon WS).
 *
 *  setSessionBoardSerial
 *  - Persists the serial via the room manager and publishes
 *    `SessionBoardSerialChanged` when the value changes.
 *  - Idempotent: when the stored serial already equals the incoming value,
 *    no event fires (avoids redundant subscriber work on reconnect storms).
 *  - Rejects non-members via the shared membership check.
 *
 * The room manager + pubsub are mocked so the test focuses on resolver logic
 * (validation, identity stamping, idempotence, broadcast wiring). The Redis-
 * backed persistence path is exercised separately through room-manager unit
 * tests; this file pins the resolver contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { ConnectionContext } from '@boardsesh/shared-schema';

// The current climb on the session queue. confirmClimbOnWall now correlates
// the confirm's climbUuid against this value, so tests that exercise the
// happy path mock `getQueueState` to return a queue item with the same UUID.
const validClimbUuid = '22222222-2222-2222-2222-222222222222';
const validSerial = 'KB-AB12-CD34';

vi.mock('../services/room-manager', () => ({
  roomManager: {
    setSessionBoardSerialAndReturnPrevious: vi.fn(),
    getSessionBoardSerial: vi.fn().mockResolvedValue(null),
    // Mutations now return Session! (matching takeControl / releaseControl)
    // and call these helpers to build the response payload.
    getSessionUsers: vi.fn().mockResolvedValue([]),
    getSessionById: vi.fn().mockResolvedValue({
      name: 'Test Session',
      boardPath: 'kilter/1/1/1/40',
      goal: null,
      isPublic: true,
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endedAt: null,
      isPermanent: false,
      color: null,
    }),
    getQueueState: vi.fn().mockResolvedValue({
      sequence: 0,
      stateHash: 'hash',
      queue: [],
      // currentClimbQueueItem.climb.uuid must equal the climbUuid the
      // confirm path will send in order for the correlation check to pass.
      // Individual tests can override this when they want to exercise the
      // mismatch branch.
      currentClimbQueueItem: {
        uuid: 'queue-item-1',
        climb: { uuid: '22222222-2222-2222-2222-222222222222' },
      },
    }),
    getSessionDriverParticipantId: vi.fn().mockResolvedValue(null),
    getSessionLeaderConnectionId: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../pubsub/index', () => ({
  pubsub: {
    publishSessionEvent: vi.fn(),
    publishQueueEvent: vi.fn(),
  },
}));

vi.mock('../graphql/context', () => ({
  updateContext: vi.fn(),
  getContext: vi.fn(() => ({ sessionId: 'session-1' })),
}));

// Bypass the auth-check helper's distributed-state lookup; ctx.sessionId is
// enough for these tests since we control the context. By default
// `requireSessionMember` resolves; specific tests override it to reject.
vi.mock('../graphql/resolvers/shared/helpers', async () => {
  const actual = await vi.importActual<typeof import('../graphql/resolvers/shared/helpers')>(
    '../graphql/resolvers/shared/helpers',
  );
  return {
    ...actual,
    requireSessionMember: vi.fn().mockResolvedValue(undefined),
    applyRateLimit: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../services/apns', () => ({
  endLiveActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../jobs/inferred-session-builder', () => ({
  adoptRecentTicksForSession: vi.fn(),
  extractBoardType: vi.fn(() => 'kilter'),
}));

// Import after mocks are wired so the module under test picks them up.
const { sessionMutations } = await import('../graphql/resolvers/sessions/mutations');
const { roomManager } = await import('../services/room-manager');
const { pubsub } = await import('../pubsub/index');
const sharedHelpers = await import('../graphql/resolvers/shared/helpers');

const roomManagerMock = roomManager as unknown as {
  setSessionBoardSerialAndReturnPrevious: ReturnType<typeof vi.fn>;
  getSessionBoardSerial: ReturnType<typeof vi.fn>;
  getQueueState: ReturnType<typeof vi.fn>;
};
const pubsubMock = pubsub as unknown as { publishSessionEvent: ReturnType<typeof vi.fn> };
const requireSessionMemberMock = sharedHelpers.requireSessionMember as unknown as ReturnType<typeof vi.fn>;

function makeCtx(overrides: Partial<ConnectionContext> = {}): ConnectionContext {
  return {
    connectionId: 'conn-1',
    transport: 'ws',
    sessionId: 'session-1',
    participantId: 'participant-1',
    userId: undefined,
    isAuthenticated: false,
    ...overrides,
  };
}

// Resets `getQueueState` to return a queue with `validClimbUuid` as the
// current climb. The vi.mock setup pre-fills this, but `vi.clearAllMocks`
// in `beforeEach` blows away the resolved value so each test that exercises
// the happy path has to re-prime it.
function primeCurrentClimb(uuid: string = validClimbUuid): void {
  roomManagerMock.getQueueState.mockResolvedValue({
    sequence: 0,
    stateHash: 'hash',
    queue: [],
    currentClimbQueueItem: {
      uuid: 'queue-item-1',
      climb: { uuid },
    },
  });
}

describe('confirmClimbOnWall mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionMemberMock.mockResolvedValue(undefined);
    // Default to the happy path: the session's current climb matches the
    // confirm's climbUuid so the correlation check passes. Tests exercising
    // the mismatch branch override this explicitly.
    primeCurrentClimb();
  });

  it('publishes WallConfirmedClimb with the caller as confirmedByParticipantId and a server-stamped timestamp, returning a Session', async () => {
    const ctx = makeCtx({ participantId: 'participant-1' });
    const before = Date.now();

    const result = await sessionMutations.confirmClimbOnWall(undefined, { climbUuid: validClimbUuid }, ctx);

    // Resolver now returns Session! (mirrors takeControl / releaseControl).
    expect(result).toMatchObject({
      id: 'session-1',
      participantId: 'participant-1',
    });
    expect(pubsubMock.publishSessionEvent).toHaveBeenCalledTimes(1);
    const [publishedSessionId, publishedEvent] = pubsubMock.publishSessionEvent.mock.calls[0] as unknown as [
      string,
      {
        __typename: 'WallConfirmedClimb';
        climbUuid: string;
        confirmedAt: string;
        confirmedByParticipantId: string;
        queueItemUuid: string | null;
      },
    ];
    expect(publishedSessionId).toBe('session-1');
    expect(publishedEvent.__typename).toBe('WallConfirmedClimb');
    expect(publishedEvent.climbUuid).toBe(validClimbUuid);
    expect(publishedEvent.confirmedByParticipantId).toBe('participant-1');
    expect(publishedEvent.queueItemUuid).toBeNull();
    // Server-stamped: confirmedAt is a valid ISO string within a sane window.
    const stampedMs = Date.parse(publishedEvent.confirmedAt);
    expect(Number.isNaN(stampedMs)).toBe(false);
    expect(stampedMs).toBeGreaterThanOrEqual(before);
    expect(stampedMs).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('falls back to connectionId when ctx.participantId is missing (anonymous users)', async () => {
    const ctx = makeCtx({ participantId: undefined, connectionId: 'conn-anon-1' });

    await sessionMutations.confirmClimbOnWall(undefined, { climbUuid: validClimbUuid }, ctx);

    expect(pubsubMock.publishSessionEvent).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        __typename: 'WallConfirmedClimb',
        confirmedByParticipantId: 'conn-anon-1',
      }),
    );
  });

  it('rejects non-members (requireSessionMember throws) and does not publish', async () => {
    requireSessionMemberMock.mockRejectedValueOnce(new Error('Not a member of session'));
    const ctx = makeCtx();

    await expect(sessionMutations.confirmClimbOnWall(undefined, { climbUuid: validClimbUuid }, ctx)).rejects.toThrow(
      /Not a member of session/,
    );
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });

  it('rejects an invalid climb UUID (validation runs before broadcast)', async () => {
    const ctx = makeCtx();
    await expect(sessionMutations.confirmClimbOnWall(undefined, { climbUuid: '' }, ctx)).rejects.toThrow(/climbUuid/i);
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });

  it('forwards the optional queueItemUuid argument when supplied', async () => {
    const ctx = makeCtx({ participantId: 'participant-1' });
    const queueItemUuid = '33333333-3333-3333-3333-333333333333';

    await sessionMutations.confirmClimbOnWall(undefined, { climbUuid: validClimbUuid, queueItemUuid }, ctx);

    expect(pubsubMock.publishSessionEvent).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        __typename: 'WallConfirmedClimb',
        queueItemUuid,
      }),
    );
  });

  it('rejects when climbUuid does not match the session current climb (grief-vector guard)', async () => {
    // Session is on a different climb than the one being confirmed. Without
    // this guard any member could spam fake confirms for an unrelated
    // climbUuid and suppress everyone's 2 s recovery fallback.
    roomManagerMock.getQueueState.mockResolvedValueOnce({
      sequence: 0,
      stateHash: 'hash',
      queue: [],
      currentClimbQueueItem: {
        uuid: 'queue-item-1',
        climb: { uuid: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA' },
      },
    });
    const ctx = makeCtx();

    await expect(sessionMutations.confirmClimbOnWall(undefined, { climbUuid: validClimbUuid }, ctx)).rejects.toThrow(
      /climbUuid mismatch/i,
    );
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });

  it('rejects when the session has no current climb (correlation requires a target)', async () => {
    roomManagerMock.getQueueState.mockResolvedValueOnce({
      sequence: 0,
      stateHash: 'hash',
      queue: [],
      currentClimbQueueItem: null,
    });
    const ctx = makeCtx();

    await expect(sessionMutations.confirmClimbOnWall(undefined, { climbUuid: validClimbUuid }, ctx)).rejects.toThrow(
      /climbUuid mismatch/i,
    );
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });
});

describe('setSessionBoardSerial mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionMemberMock.mockResolvedValue(undefined);
  });

  it('persists the serial and publishes SessionBoardSerialChanged when the value changes, returning a Session', async () => {
    // Previous serial was null → caller sets the first value, an actual transition.
    roomManagerMock.setSessionBoardSerialAndReturnPrevious.mockResolvedValueOnce(null);
    const ctx = makeCtx();

    const result = await sessionMutations.setSessionBoardSerial(undefined, { serial: validSerial }, ctx);

    // Resolver now returns Session! (mirrors takeControl / releaseControl).
    expect(result).toMatchObject({
      id: 'session-1',
      lastConnectedBoardSerial: validSerial,
    });
    expect(roomManagerMock.setSessionBoardSerialAndReturnPrevious).toHaveBeenCalledWith('session-1', validSerial);
    expect(pubsubMock.publishSessionEvent).toHaveBeenCalledWith('session-1', {
      __typename: 'SessionBoardSerialChanged',
      lastConnectedBoardSerial: validSerial,
    });
  });

  it('is idempotent — no event fires when the stored serial already matches', async () => {
    // Previous serial equals the incoming value: no transition, no broadcast.
    roomManagerMock.setSessionBoardSerialAndReturnPrevious.mockResolvedValueOnce(validSerial);
    const ctx = makeCtx();

    const result = await sessionMutations.setSessionBoardSerial(undefined, { serial: validSerial }, ctx);

    expect(result).toMatchObject({
      id: 'session-1',
      lastConnectedBoardSerial: validSerial,
    });
    expect(roomManagerMock.setSessionBoardSerialAndReturnPrevious).toHaveBeenCalledWith('session-1', validSerial);
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });

  it('broadcasts when a participant overwrites a different board serial (e.g. moving to a second board)', async () => {
    roomManagerMock.setSessionBoardSerialAndReturnPrevious.mockResolvedValueOnce('KB-OLD-9999');
    const ctx = makeCtx();

    await sessionMutations.setSessionBoardSerial(undefined, { serial: validSerial }, ctx);

    expect(pubsubMock.publishSessionEvent).toHaveBeenCalledWith('session-1', {
      __typename: 'SessionBoardSerialChanged',
      lastConnectedBoardSerial: validSerial,
    });
  });

  it('rejects non-members and does not write to the room manager', async () => {
    requireSessionMemberMock.mockRejectedValueOnce(new Error('Not a member of session'));
    const ctx = makeCtx();

    await expect(sessionMutations.setSessionBoardSerial(undefined, { serial: validSerial }, ctx)).rejects.toThrow(
      /Not a member of session/,
    );
    expect(roomManagerMock.setSessionBoardSerialAndReturnPrevious).not.toHaveBeenCalled();
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });

  it('rejects an invalid serial (validation runs before any write)', async () => {
    const ctx = makeCtx();
    await expect(sessionMutations.setSessionBoardSerial(undefined, { serial: 'has spaces!' }, ctx)).rejects.toThrow(
      /serial/i,
    );
    expect(roomManagerMock.setSessionBoardSerialAndReturnPrevious).not.toHaveBeenCalled();
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });
});
