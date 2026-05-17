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

vi.mock('../services/room-manager', () => ({
  roomManager: {
    setSessionBoardSerialAndReturnPrevious: vi.fn(),
    getSessionBoardSerial: vi.fn().mockResolvedValue(null),
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

const validClimbUuid = '22222222-2222-2222-2222-222222222222';
const validSerial = 'KB-AB12-CD34';

describe('confirmClimbOnWall mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionMemberMock.mockResolvedValue(undefined);
  });

  it('publishes WallConfirmedClimb with the caller as confirmedByParticipantId and a server-stamped timestamp', async () => {
    const ctx = makeCtx({ participantId: 'participant-1' });
    const before = Date.now();

    const result = await sessionMutations.confirmClimbOnWall(
      undefined,
      { sessionId: 'session-1', climbUuid: validClimbUuid },
      ctx,
    );

    expect(result).toBe(true);
    expect(pubsubMock.publishSessionEvent).toHaveBeenCalledTimes(1);
    const [publishedSessionId, publishedEvent] = pubsubMock.publishSessionEvent.mock.calls[0] as unknown as [
      string,
      { __typename: 'WallConfirmedClimb'; climbUuid: string; confirmedAt: string; confirmedByParticipantId: string },
    ];
    expect(publishedSessionId).toBe('session-1');
    expect(publishedEvent.__typename).toBe('WallConfirmedClimb');
    expect(publishedEvent.climbUuid).toBe(validClimbUuid);
    expect(publishedEvent.confirmedByParticipantId).toBe('participant-1');
    // Server-stamped: confirmedAt is a valid ISO string within a sane window.
    const stampedMs = Date.parse(publishedEvent.confirmedAt);
    expect(Number.isNaN(stampedMs)).toBe(false);
    expect(stampedMs).toBeGreaterThanOrEqual(before);
    expect(stampedMs).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('falls back to connectionId when ctx.participantId is missing (anonymous users)', async () => {
    const ctx = makeCtx({ participantId: undefined, connectionId: 'conn-anon-1' });

    await sessionMutations.confirmClimbOnWall(undefined, { sessionId: 'session-1', climbUuid: validClimbUuid }, ctx);

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

    await expect(
      sessionMutations.confirmClimbOnWall(undefined, { sessionId: 'session-1', climbUuid: validClimbUuid }, ctx),
    ).rejects.toThrow(/Not a member of session/);
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });

  it('rejects an invalid climb UUID (validation runs before broadcast)', async () => {
    const ctx = makeCtx();
    await expect(
      sessionMutations.confirmClimbOnWall(undefined, { sessionId: 'session-1', climbUuid: '' }, ctx),
    ).rejects.toThrow(/climbUuid/i);
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });
});

describe('setSessionBoardSerial mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionMemberMock.mockResolvedValue(undefined);
  });

  it('persists the serial and publishes SessionBoardSerialChanged when the value changes', async () => {
    // Previous serial was null → caller sets the first value, an actual transition.
    roomManagerMock.setSessionBoardSerialAndReturnPrevious.mockResolvedValueOnce(null);
    const ctx = makeCtx();

    const result = await sessionMutations.setSessionBoardSerial(
      undefined,
      { sessionId: 'session-1', serial: validSerial },
      ctx,
    );

    expect(result).toBe(true);
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

    const result = await sessionMutations.setSessionBoardSerial(
      undefined,
      { sessionId: 'session-1', serial: validSerial },
      ctx,
    );

    expect(result).toBe(true);
    expect(roomManagerMock.setSessionBoardSerialAndReturnPrevious).toHaveBeenCalledWith('session-1', validSerial);
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });

  it('broadcasts when a participant overwrites a different board serial (e.g. moving to a second board)', async () => {
    roomManagerMock.setSessionBoardSerialAndReturnPrevious.mockResolvedValueOnce('KB-OLD-9999');
    const ctx = makeCtx();

    await sessionMutations.setSessionBoardSerial(undefined, { sessionId: 'session-1', serial: validSerial }, ctx);

    expect(pubsubMock.publishSessionEvent).toHaveBeenCalledWith('session-1', {
      __typename: 'SessionBoardSerialChanged',
      lastConnectedBoardSerial: validSerial,
    });
  });

  it('rejects non-members and does not write to the room manager', async () => {
    requireSessionMemberMock.mockRejectedValueOnce(new Error('Not a member of session'));
    const ctx = makeCtx();

    await expect(
      sessionMutations.setSessionBoardSerial(undefined, { sessionId: 'session-1', serial: validSerial }, ctx),
    ).rejects.toThrow(/Not a member of session/);
    expect(roomManagerMock.setSessionBoardSerialAndReturnPrevious).not.toHaveBeenCalled();
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });

  it('rejects an invalid serial (validation runs before any write)', async () => {
    const ctx = makeCtx();
    await expect(
      sessionMutations.setSessionBoardSerial(undefined, { sessionId: 'session-1', serial: 'has spaces!' }, ctx),
    ).rejects.toThrow(/serial/i);
    expect(roomManagerMock.setSessionBoardSerialAndReturnPrevious).not.toHaveBeenCalled();
    expect(pubsubMock.publishSessionEvent).not.toHaveBeenCalled();
  });
});
