import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { ConnectionContext } from '@boardsesh/shared-schema';

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    execute: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  };
  return { mockDb };
});

vi.mock('../db/client', () => ({ db: mockDb }));
vi.mock('../utils/rate-limiter', () => ({ checkRateLimit: vi.fn() }));
vi.mock('../utils/redis-rate-limiter', () => ({ checkRateLimitRedis: vi.fn() }));

import { playlistMutations } from '../graphql/resolvers/playlists/mutations';

function makeCtx(overrides: Partial<ConnectionContext> = {}): ConnectionContext {
  return {
    connectionId: 'conn-1',
    isAuthenticated: true,
    userId: 'user-123',
    sessionId: null,
    boardPath: null,
    controllerId: null,
    controllerApiKey: null,
    ...overrides,
  } as ConnectionContext;
}

/** A thenable Drizzle-style chain resolving to `resolveValue` when awaited. */
function createMockChain(resolveValue: unknown = []): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'from', 'where', 'innerJoin', 'limit', 'orderBy', 'for', 'set', 'update', 'returning'];
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolveValue).then(resolve);
  for (const method of methods) chain[method] = vi.fn((..._args: unknown[]) => chain);
  return chain;
}

type ClimbRow = { id: number; climbUuid: string; position: number };

/**
 * Mock a transaction whose `tx.select(...).orderBy()` yields `rows` and whose
 * `tx.update(...).set(x)` records `x`. The resolver renumbers via the update
 * chain; capturing every `set` arg lets us assert the positions written.
 */
function primeTransaction(rows: ClimbRow[]) {
  const setCalls: Array<Record<string, unknown>> = [];
  const selectChain = createMockChain(rows);
  const tx = {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.set = vi.fn((arg: Record<string, unknown>) => {
        setCalls.push(arg);
        return chain;
      });
      chain.where = vi.fn(() => chain);
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve([]).then(resolve);
      return chain;
    }),
  };
  mockDb.transaction.mockImplementationOnce(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));
  return { setCalls };
}

/** Positions written to playlistClimbs rows, in write order. */
function writtenPositions(setCalls: Array<Record<string, unknown>>): number[] {
  return setCalls.filter((call) => 'position' in call).map((call) => call.position as number);
}

const ROWS: ClimbRow[] = [
  { id: 1, climbUuid: 'climb-a', position: 0 },
  { id: 2, climbUuid: 'climb-b', position: 1 },
  { id: 3, climbUuid: 'climb-c', position: 2 },
];

describe('reorderPlaylistClimb mutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves a climb to a new index and renumbers positions densely', async () => {
    mockDb.select.mockReturnValueOnce(createMockChain([{ id: 1 }])); // ownership
    const { setCalls } = primeTransaction(ROWS.map((row) => ({ ...row })));

    // Move climb-c (currently last) to the front → [C, A, B].
    const result = await playlistMutations.reorderPlaylistClimb(
      null,
      { input: { playlistId: 'p-uuid', climbUuid: 'climb-c', newIndex: 0 } },
      makeCtx(),
    );

    expect(result).toBe(true);
    // Every row shifts, so all three are rewritten to dense 0,1,2.
    expect(writtenPositions(setCalls)).toEqual([0, 1, 2]);
    // The parent playlist's updatedAt is bumped as the final set.
    expect('updatedAt' in setCalls[setCalls.length - 1]).toBe(true);
  });

  it('clamps an out-of-range index to the last position', async () => {
    mockDb.select.mockReturnValueOnce(createMockChain([{ id: 1 }]));
    const { setCalls } = primeTransaction(ROWS.map((row) => ({ ...row })));

    // newIndex past the end → clamp to 2. Move climb-a to the end → [B, C, A].
    const result = await playlistMutations.reorderPlaylistClimb(
      null,
      { input: { playlistId: 'p-uuid', climbUuid: 'climb-a', newIndex: 99 } },
      makeCtx(),
    );

    expect(result).toBe(true);
    expect(writtenPositions(setCalls)).toEqual([0, 1, 2]);
  });

  it('writes only the rows that actually shift for an interior move', async () => {
    mockDb.select.mockReturnValueOnce(createMockChain([{ id: 1 }]));
    const fiveRows: ClimbRow[] = [
      { id: 1, climbUuid: 'climb-a', position: 0 },
      { id: 2, climbUuid: 'climb-b', position: 1 },
      { id: 3, climbUuid: 'climb-c', position: 2 },
      { id: 4, climbUuid: 'climb-d', position: 3 },
      { id: 5, climbUuid: 'climb-e', position: 4 },
    ];
    const { setCalls } = primeTransaction(fiveRows);

    // Move climb-d (index 3) up to index 2 → [A, B, D, C, E]. Only D and C shift;
    // A, B, E keep their positions and must not be rewritten.
    const result = await playlistMutations.reorderPlaylistClimb(
      null,
      { input: { playlistId: 'p-uuid', climbUuid: 'climb-d', newIndex: 2 } },
      makeCtx(),
    );

    expect(result).toBe(true);
    expect(writtenPositions(setCalls)).toEqual([2, 3]);
  });

  it('writes no position changes for a no-op move but still succeeds', async () => {
    mockDb.select.mockReturnValueOnce(createMockChain([{ id: 1 }]));
    const { setCalls } = primeTransaction(ROWS.map((row) => ({ ...row })));

    // climb-a is already at index 0.
    const result = await playlistMutations.reorderPlaylistClimb(
      null,
      { input: { playlistId: 'p-uuid', climbUuid: 'climb-a', newIndex: 0 } },
      makeCtx(),
    );

    expect(result).toBe(true);
    expect(writtenPositions(setCalls)).toEqual([]);
    expect('updatedAt' in setCalls[setCalls.length - 1]).toBe(true);
  });

  it('throws when the climb is not in the playlist', async () => {
    mockDb.select.mockReturnValueOnce(createMockChain([{ id: 1 }]));
    primeTransaction(ROWS.map((row) => ({ ...row })));

    await expect(
      playlistMutations.reorderPlaylistClimb(
        null,
        { input: { playlistId: 'p-uuid', climbUuid: 'climb-missing', newIndex: 0 } },
        makeCtx(),
      ),
    ).rejects.toThrow('Climb not found in playlist');
  });

  it('rejects a non-owner before touching the transaction', async () => {
    mockDb.select.mockReturnValueOnce(createMockChain([])); // no ownership row

    await expect(
      playlistMutations.reorderPlaylistClimb(
        null,
        { input: { playlistId: 'p-uuid', climbUuid: 'climb-a', newIndex: 0 } },
        makeCtx(),
      ),
    ).rejects.toThrow('you do not have permission');

    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    await expect(
      playlistMutations.reorderPlaylistClimb(
        null,
        { input: { playlistId: 'p-uuid', climbUuid: 'climb-a', newIndex: 0 } },
        makeCtx({ isAuthenticated: false, userId: undefined }),
      ),
    ).rejects.toThrow();

    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
