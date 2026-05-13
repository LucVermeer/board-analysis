/**
 * Regression tests for the joinSession / createSession context-update flow.
 *
 * Background: `roomManager.joinSession` returns `clientId: connectionId` (the
 * WebSocket connection ID). For a long time the resolvers passed that value
 * into `updateContext` as `userId`, clobbering the real authenticated user
 * UUID set by auth middleware. Downstream resolvers (climb mutations, ESP32
 * auto-authorize, tick adoption) then queried using the connection ID and
 * either matched zero rows or wrote records under the wrong owner.
 *
 * These tests pin the contract: `updateContext` must never receive a
 * `userId` field from joinSession / createSession — auth already set it.
 */
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { ConnectionContext } from '@boardsesh/shared-schema';
import { sessionMutations } from '../graphql/resolvers/sessions/mutations';
import { updateContext } from '../graphql/context';

vi.mock('../services/room-manager', () => ({
  roomManager: {
    joinSession: vi.fn().mockResolvedValue({
      clientId: 'ws-conn-abc-123',
      isLeader: true,
      users: [],
      queue: [],
      currentClimbQueueItem: null,
      sequence: 0,
      stateHash: 'hash',
      sessionName: null,
    }),
    createDiscoverableSession: vi.fn().mockResolvedValue({}),
    getSessionById: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../pubsub/index', () => ({
  pubsub: { publishSessionEvent: vi.fn() },
}));

vi.mock('../graphql/context', () => ({
  updateContext: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: () => 'test-session-uuid',
}));

vi.mock('../db/client', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../jobs/inferred-session-builder', () => ({
  adoptRecentTicksForSession: vi.fn().mockResolvedValue(undefined),
  extractBoardType: vi.fn().mockReturnValue('kilter'),
}));

function makeWsAuthenticatedCtx(userId: string): ConnectionContext {
  return {
    connectionId: 'ws-conn-abc-123',
    sessionId: undefined,
    userId,
    isAuthenticated: true,
  };
}

describe('joinSession does not clobber ctx.userId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes only { sessionId } to updateContext, preserving the authenticated user UUID', async () => {
    const realUserId = '8a68ddc8-8da0-47e2-a968-1029b6fb4bb3';
    const ctx = makeWsAuthenticatedCtx(realUserId);

    await sessionMutations.joinSession(
      undefined,
      {
        sessionId: 'session-aaaa-bbbb-cccc-dddd',
        boardPath: '/kilter/1/2/3/40',
      },
      ctx,
    );

    expect(updateContext).toHaveBeenCalledOnce();
    const [calledConnectionId, calledUpdates] = vi.mocked(updateContext).mock.calls[0];
    expect(calledConnectionId).toBe('ws-conn-abc-123');
    expect(calledUpdates).toEqual({ sessionId: 'session-aaaa-bbbb-cccc-dddd' });
    expect(calledUpdates).not.toHaveProperty('userId');
  });
});

describe('createSession does not clobber ctx.userId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes only { sessionId } to updateContext on the WebSocket path', async () => {
    const realUserId = '8a68ddc8-8da0-47e2-a968-1029b6fb4bb3';
    const ctx = makeWsAuthenticatedCtx(realUserId);

    await sessionMutations.createSession(
      undefined,
      {
        input: {
          boardPath: '/kilter/1/2/3/40',
          latitude: 0,
          longitude: 0,
          discoverable: false,
          name: 'Test',
        },
      },
      ctx,
    );

    expect(updateContext).toHaveBeenCalledOnce();
    const [, calledUpdates] = vi.mocked(updateContext).mock.calls[0];
    expect(calledUpdates).toEqual({ sessionId: 'test-session-uuid' });
    expect(calledUpdates).not.toHaveProperty('userId');
  });
});
