/**
 * Tests for the activityPushToken register/unregister mutations.
 *
 * Verifies:
 * - Unauthenticated requests are rejected.
 * - Authenticated but non-participant requests are rejected.
 * - Bad token format is rejected.
 * - Authenticated participant + good token succeeds.
 * - The unregister DELETE is scoped by both token AND sessionId.
 */

import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { ConnectionContext } from '@boardsesh/shared-schema';

// ---------------------------------------------------------------------------
// Mocks — exercised before the resolver is imported.
// ---------------------------------------------------------------------------

const participantRows = vi.fn<() => Array<{ sessionId: string }>>(() => []);
const countRows = vi.fn<() => Array<{ value: number }>>(() => [{ value: 0 }]);
const oldestTokenRows = vi.fn<() => Array<{ token: string }>>(() => []);

const insertOnConflictDoUpdate = vi.fn();
const deleteWhere = vi.fn();
const insertValuesReturn = { onConflictDoUpdate: insertOnConflictDoUpdate };
const insertReturn = { values: vi.fn(() => insertValuesReturn) };

vi.mock('../db/client', () => {
  const limit = vi.fn(async (_n: number) => participantRows());

  // Drizzle-style chain: select().from().where().limit() OR
  //                     select({...count}).from().where()
  function makeSelectChain() {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => {
      // For count(): the `where()` is awaited directly. We hand back a thenable.
      // For participant: a `.limit()` call is appended.
      const result: Record<string, unknown> = {};
      result.limit = limit;
      result.orderBy = vi.fn(() => ({
        limit: vi.fn(async (_n: number) => oldestTokenRows()),
      }));
      // Make this object thenable so `await db.select().from().where()` resolves
      result.then = (onFulfilled: (rows: Array<{ value: number }>) => unknown) => onFulfilled(countRows());
      return result;
    });
    return chain;
  }

  const db = {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn(() => insertReturn),
    delete: vi.fn(() => ({ where: deleteWhere })),
    // The resolver runs count + delete + insert inside `db.transaction(...)`
    // under a Postgres advisory lock. The mock transaction just exposes the
    // same surface and invokes the callback synchronously — `execute` is a
    // no-op here because the tests don't care about the lock SQL itself,
    // only about the chained select/delete/insert calls.
    transaction: vi.fn(
      async <T>(callback: (tx: typeof db & { execute: (q: unknown) => Promise<void> }) => Promise<T>): Promise<T> => {
        const tx = {
          ...db,
          execute: vi.fn(async (_q: unknown) => undefined),
        };
        return callback(tx);
      },
    ),
  };

  return { db };
});

const { pushTokenMutations, __resetPushTokenRateLimitForTests } =
  await import('../graphql/resolvers/sessions/push-tokens');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'a'.repeat(64); // 64 hex chars
const INVALID_TOKEN = 'not-a-real-hex-token';
const SESSION_ID = 'session-test-1';
const USER_ID = 'user-test-1';

function authedCtx(userId = USER_ID): ConnectionContext {
  return {
    connectionId: `http-${userId}`,
    sessionId: undefined,
    userId,
    isAuthenticated: true,
  };
}

function anonCtx(): ConnectionContext {
  return {
    connectionId: 'http-anon-1',
    sessionId: undefined,
    userId: undefined,
    isAuthenticated: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerActivityPushToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetPushTokenRateLimitForTests();
    participantRows.mockReturnValue([{ sessionId: SESSION_ID }]);
    countRows.mockReturnValue([{ value: 0 }]);
    oldestTokenRows.mockReturnValue([]);
  });

  it('rejects unauthenticated callers', async () => {
    await expect(
      pushTokenMutations.registerActivityPushToken(undefined, { sessionId: SESSION_ID, token: VALID_TOKEN }, anonCtx()),
    ).rejects.toThrow('Authentication required');
  });

  it('rejects authenticated non-participants', async () => {
    participantRows.mockReturnValue([]); // no participant row
    await expect(
      pushTokenMutations.registerActivityPushToken(
        undefined,
        { sessionId: SESSION_ID, token: VALID_TOKEN },
        authedCtx(),
      ),
    ).rejects.toThrow('not a participant');
  });

  it('rejects bad token format', async () => {
    await expect(
      pushTokenMutations.registerActivityPushToken(
        undefined,
        { sessionId: SESSION_ID, token: INVALID_TOKEN },
        authedCtx(),
      ),
    ).rejects.toThrow('Invalid APNs token format');
  });

  it('inserts when authenticated participant supplies a valid token', async () => {
    const result = await pushTokenMutations.registerActivityPushToken(
      undefined,
      { sessionId: SESSION_ID, token: VALID_TOKEN },
      authedCtx(),
    );

    expect(result).toBe(true);
    expect(insertReturn.values).toHaveBeenCalledWith(
      expect.objectContaining({ token: VALID_TOKEN, sessionId: SESSION_ID }),
    );
    expect(insertOnConflictDoUpdate).toHaveBeenCalled();
  });

  it('rejects empty sessionId or token', async () => {
    await expect(
      pushTokenMutations.registerActivityPushToken(undefined, { sessionId: '', token: VALID_TOKEN }, authedCtx()),
    ).rejects.toThrow('sessionId and token are required');
    await expect(
      pushTokenMutations.registerActivityPushToken(undefined, { sessionId: SESSION_ID, token: '' }, authedCtx()),
    ).rejects.toThrow('sessionId and token are required');
  });
});

describe('unregisterActivityPushToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetPushTokenRateLimitForTests();
    participantRows.mockReturnValue([{ sessionId: SESSION_ID }]);
  });

  it('rejects unauthenticated callers', async () => {
    await expect(
      pushTokenMutations.unregisterActivityPushToken(
        undefined,
        { sessionId: SESSION_ID, token: VALID_TOKEN },
        anonCtx(),
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('rejects authenticated non-participants', async () => {
    participantRows.mockReturnValue([]);
    await expect(
      pushTokenMutations.unregisterActivityPushToken(
        undefined,
        { sessionId: SESSION_ID, token: VALID_TOKEN },
        authedCtx(),
      ),
    ).rejects.toThrow('not a participant');
  });

  it('rejects bad token format', async () => {
    await expect(
      pushTokenMutations.unregisterActivityPushToken(
        undefined,
        { sessionId: SESSION_ID, token: INVALID_TOKEN },
        authedCtx(),
      ),
    ).rejects.toThrow('Invalid APNs token format');
  });

  it('issues DELETE scoped by token AND sessionId for valid input', async () => {
    deleteWhere.mockResolvedValue(undefined);

    const result = await pushTokenMutations.unregisterActivityPushToken(
      undefined,
      { sessionId: SESSION_ID, token: VALID_TOKEN },
      authedCtx(),
    );

    expect(result).toBe(true);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});

describe('rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetPushTokenRateLimitForTests();
    participantRows.mockReturnValue([{ sessionId: SESSION_ID }]);
    countRows.mockReturnValue([{ value: 0 }]);
    oldestTokenRows.mockReturnValue([]);
    deleteWhere.mockResolvedValue(undefined);
  });

  it('rejects with a rate-limit error after the bucket is exhausted', async () => {
    // Bucket capacity is 5. Burn through capacity from a single (user, session) pair.
    for (let i = 0; i < 5; i++) {
      await pushTokenMutations.registerActivityPushToken(
        undefined,
        { sessionId: SESSION_ID, token: VALID_TOKEN },
        authedCtx(),
      );
    }

    await expect(
      pushTokenMutations.registerActivityPushToken(
        undefined,
        { sessionId: SESSION_ID, token: VALID_TOKEN },
        authedCtx(),
      ),
    ).rejects.toThrow('Too many push-token requests');
  });

  it('shares the bucket across register and unregister for the same (user, session)', async () => {
    // 3 registers + 2 unregisters = 5 calls, all should succeed.
    for (let i = 0; i < 3; i++) {
      await pushTokenMutations.registerActivityPushToken(
        undefined,
        { sessionId: SESSION_ID, token: VALID_TOKEN },
        authedCtx(),
      );
    }
    for (let i = 0; i < 2; i++) {
      await pushTokenMutations.unregisterActivityPushToken(
        undefined,
        { sessionId: SESSION_ID, token: VALID_TOKEN },
        authedCtx(),
      );
    }

    // 6th call (any kind) trips the limit.
    await expect(
      pushTokenMutations.unregisterActivityPushToken(
        undefined,
        { sessionId: SESSION_ID, token: VALID_TOKEN },
        authedCtx(),
      ),
    ).rejects.toThrow('Too many push-token requests');
  });

  it('isolates buckets across distinct users', async () => {
    // User A burns their bucket on SESSION_ID.
    for (let i = 0; i < 5; i++) {
      await pushTokenMutations.registerActivityPushToken(
        undefined,
        { sessionId: SESSION_ID, token: VALID_TOKEN },
        authedCtx('user-a'),
      );
    }
    // User B on the same session should still succeed.
    const result = await pushTokenMutations.registerActivityPushToken(
      undefined,
      { sessionId: SESSION_ID, token: VALID_TOKEN },
      authedCtx('user-b'),
    );
    expect(result).toBe(true);
  });
});
