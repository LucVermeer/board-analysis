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
import { pubsub } from '../pubsub/index';

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
    leaveSession: vi.fn().mockResolvedValue({
      sessionId: 'session-aaaa-bbbb-cccc-dddd',
      newLeaderId: undefined,
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

describe('leaveSession publishes UserLeft with the connection ID', () => {
  // Background: the disconnect handler in websocket/setup.ts and the
  // explicit `leaveSession` mutation both emit a `UserLeft` event so
  // peers can drop the departing user from their participant list. The
  // GraphQL schema names the payload field `userId` but the *contract*
  // with the client is that it carries the connection ID — clients
  // populate their participant list from `UserJoined.user.id`, which is
  // `result.clientId` (the connection ID), and filter by
  // `u.id !== event.userId`. The two events must agree.
  //
  // Earlier commits in this PR stopped clobbering `ctx.userId` with the
  // connection ID. The leaveSession mutation was previously guarded by
  // `if (userId)` and only fired because of that clobber, so it would
  // have silently stopped emitting UserLeft for unauthenticated clients
  // (and for authenticated clients would have emitted the real user
  // UUID — wrong shape, fails the client filter). This test pins the
  // correct behaviour.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits UserLeft with userId === ctx.connectionId for authenticated clients', async () => {
    const realUserId = '8a68ddc8-8da0-47e2-a968-1029b6fb4bb3';
    const ctx: ConnectionContext = {
      connectionId: 'ws-conn-abc-123',
      sessionId: 'session-aaaa-bbbb-cccc-dddd',
      userId: realUserId,
      isAuthenticated: true,
    };

    await sessionMutations.leaveSession(undefined, undefined, ctx);

    const calls = vi.mocked(pubsub.publishSessionEvent).mock.calls;
    const userLeftCall = calls.find(
      (call): call is [string, { __typename: 'UserLeft'; userId: string }] =>
        typeof call[1] === 'object' &&
        call[1] !== null &&
        (call[1] as { __typename?: string }).__typename === 'UserLeft',
    );
    expect(userLeftCall).toBeDefined();
    expect(userLeftCall![0]).toBe('session-aaaa-bbbb-cccc-dddd');
    expect(userLeftCall![1].userId).toBe('ws-conn-abc-123');
    // It must NOT be the auth user UUID — clients filter participants
    // by connection ID and would fail to remove the user otherwise.
    expect(userLeftCall![1].userId).not.toBe(realUserId);

    // updateContext must clear ONLY sessionId; userId must be preserved
    // for downstream resolvers on this same connection (queries, social
    // actions, etc.). An earlier version of this resolver wrote
    // `{ sessionId: undefined, userId: undefined }`, which looked like
    // it was deliberately wiping the auth UUID.
    expect(updateContext).toHaveBeenCalledOnce();
    const [, calledUpdates] = vi.mocked(updateContext).mock.calls[0];
    expect(calledUpdates).toEqual({ sessionId: undefined });
    expect(calledUpdates).not.toHaveProperty('userId');
  });

  it('emits UserLeft for unauthenticated clients (which previously had no userId on ctx)', async () => {
    const ctx: ConnectionContext = {
      connectionId: 'ws-conn-anon-456',
      sessionId: 'session-zzzz',
      userId: undefined,
      isAuthenticated: false,
    };

    await sessionMutations.leaveSession(undefined, undefined, ctx);

    const calls = vi.mocked(pubsub.publishSessionEvent).mock.calls;
    const userLeftCall = calls.find(
      (call): call is [string, { __typename: 'UserLeft'; userId: string }] =>
        typeof call[1] === 'object' &&
        call[1] !== null &&
        (call[1] as { __typename?: string }).__typename === 'UserLeft',
    );
    expect(userLeftCall).toBeDefined();
    expect(userLeftCall![1].userId).toBe('ws-conn-anon-456');
  });
});
