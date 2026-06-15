import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { ConnectionContext } from '@boardsesh/shared-schema';
import { socialBoardQueries } from '../graphql/resolvers/social/boards';

// Mock db + dependencies before importing the resolver (vi.mock is hoisted).
const { mockDb, capturedLimits } = vi.hoisted(() => {
  const capturedLimits: number[] = [];
  const mockDb = {
    execute: vi.fn(),
    select: vi.fn(),
    selectDistinctOn: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  };
  return { mockDb, capturedLimits };
});

vi.mock('../db/client', () => ({ db: mockDb }));
vi.mock('../utils/rate-limiter', () => ({ checkRateLimit: vi.fn() }));
vi.mock('../utils/redis-rate-limiter', () => ({ checkRateLimitRedis: vi.fn() }));
vi.mock('../events/index', () => ({ publishSocialEvent: vi.fn().mockResolvedValue(undefined) }));

// A thenable query-builder stub: every chain method returns the same object, and
// awaiting it (or any link in the chain) resolves to `rows`. This is robust to
// the exact chain shape each query uses (.from().where().orderBy().limit(),
// .from().leftJoin().where(), .from().where().groupBy(), etc.).
function chain(rows: unknown[]) {
  const node: Record<string, unknown> = {};
  const methods = [
    'from',
    'where',
    'leftJoin',
    'innerJoin',
    'rightJoin',
    'orderBy',
    'limit',
    'offset',
    'groupBy',
    'having',
  ];
  for (const method of methods) {
    node[method] = vi.fn((arg?: unknown) => {
      if (method === 'limit' && typeof arg === 'number') capturedLimits.push(arg);
      return node;
    });
  }
  // The whole point of this stub is to be awaitable at the end of any chain.
  // oxlint-disable-next-line unicorn/no-thenable
  node.then = (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return node;
}

// Sequence db.select() results across the resolver's queries (A: recents,
// B: owned boards, then enrichBoards' batch). Anything past the array is [].
function setupSelectSequence(results: unknown[][]) {
  let index = 0;
  mockDb.select.mockImplementation(() => chain(results[index++] ?? []));
}

function makeAuthCtx(userId = 'user-1'): ConnectionContext {
  return { connectionId: 'conn-1', isAuthenticated: true, userId } as ConnectionContext;
}

function makeUnauthCtx(): ConnectionContext {
  return { connectionId: 'conn-1', isAuthenticated: false } as ConnectionContext;
}

function makeRecentRow(overrides: Record<string, unknown> = {}) {
  return {
    serialNumber: 'SN1',
    boardName: 'kilter',
    layoutId: 1,
    sizeId: 10,
    setIds: '1,2',
    apiLevel: 3,
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    boardUuid: null,
    ...overrides,
  };
}

function makeBoardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    uuid: 'board-uuid-1',
    slug: 'home-wall',
    ownerId: 'user-1',
    boardType: 'kilter',
    layoutId: 1,
    sizeId: 10,
    setIds: '1,2',
    name: 'Home Wall',
    description: null,
    locationName: null,
    latitude: null,
    longitude: null,
    isPublic: true,
    isUnlisted: false,
    hideLocation: false,
    isOwned: true,
    angle: 40,
    isAngleAdjustable: true,
    createdAt: new Date('2025-01-01'),
    gymId: null,
    serialNumber: 'SN1',
    deletedAt: null,
    ...overrides,
  };
}

function makeLastClimbRow(overrides: Record<string, unknown> = {}) {
  return {
    boardId: 1,
    climbUuid: 'climb-1',
    angle: 40,
    climbedAt: '2026-04-02T12:00:00.000Z',
    difficulty: 20,
    name: 'Purple Rain',
    frames: 'p1234r15',
    setter: 'setterbob',
    gradeName: 'V5',
    ...overrides,
  };
}

describe('myRecentBoardSerials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedLimits.length = 0;
    mockDb.selectDistinctOn.mockImplementation(() => chain([]));
  });

  it('throws when the caller is not authenticated, before any DB call', async () => {
    await expect(socialBoardQueries.myRecentBoardSerials(null, { limit: 10 }, makeUnauthCtx())).rejects.toThrow(
      /Authentication required/,
    );
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns an empty array (and skips enrichment) when the user has no recents', async () => {
    setupSelectSequence([[]]); // query A returns nothing

    const results = await socialBoardQueries.myRecentBoardSerials(null, { limit: 10 }, makeAuthCtx());

    expect(results).toEqual([]);
    // Only the recents query ran: no owned-board lookup, no last-climb query.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    expect(mockDb.selectDistinctOn).not.toHaveBeenCalled();
  });

  it('clamps the limit to at most 25', async () => {
    setupSelectSequence([[]]);

    await socialBoardQueries.myRecentBoardSerials(null, { limit: 1000 }, makeAuthCtx());

    expect(capturedLimits).toContain(25);
  });

  it('clamps the limit to at least 1 and defaults to 10', async () => {
    setupSelectSequence([[]]);
    await socialBoardQueries.myRecentBoardSerials(null, { limit: 0 }, makeAuthCtx());
    expect(capturedLimits).toContain(1);

    capturedLimits.length = 0;
    setupSelectSequence([[]]);
    await socialBoardQueries.myRecentBoardSerials(null, {}, makeAuthCtx());
    expect(capturedLimits).toContain(10);
  });

  it('returns ownedBoard=null and lastClimb=null for a serial with no saved board', async () => {
    setupSelectSequence([
      [makeRecentRow({ boardUuid: null })], // A: one recent
      [], // B: no owned board resolves
    ]);

    const results = await socialBoardQueries.myRecentBoardSerials(null, { limit: 10 }, makeAuthCtx());

    expect(results).toHaveLength(1);
    expect(results[0].serialNumber).toBe('SN1');
    expect(results[0].ownedBoard).toBeNull();
    expect(results[0].lastClimb).toBeNull();
    // No resolved board → no last-climb query.
    expect(mockDb.selectDistinctOn).not.toHaveBeenCalled();
  });

  it('resolves the owned board by serial match and attaches the last send', async () => {
    setupSelectSequence([
      [makeRecentRow({ boardUuid: null, serialNumber: 'SN1' })], // A
      [makeBoardRow({ serialNumber: 'SN1' })], // B: matched by serialNumber
      // enrichBoards batch (owner/ticks/followers/comments/follow) — empty is fine,
      // ownedBoard's uuid/name/serial come from the board row itself.
    ]);
    mockDb.selectDistinctOn.mockImplementation(() => chain([makeLastClimbRow()]));

    const results = await socialBoardQueries.myRecentBoardSerials(null, { limit: 10 }, makeAuthCtx('user-1'));

    expect(results).toHaveLength(1);
    expect(results[0].ownedBoard).not.toBeNull();
    expect(results[0].ownedBoard?.uuid).toBe('board-uuid-1');
    expect(results[0].ownedBoard?.name).toBe('Home Wall');
    expect(results[0].ownedBoard?.serialNumber).toBe('SN1');
    expect(results[0].lastClimb).toEqual({
      climbUuid: 'climb-1',
      name: 'Purple Rain',
      frames: 'p1234r15',
      angle: 40,
      difficulty: 20,
      gradeName: 'V5',
      setter: 'setterbob',
      climbedAt: '2026-04-02T12:00:00.000Z',
    });
  });

  it('maps updatedAt to an ISO string', async () => {
    setupSelectSequence([[makeRecentRow()], []]);

    const results = await socialBoardQueries.myRecentBoardSerials(null, { limit: 10 }, makeAuthCtx());

    expect(results[0].updatedAt).toBe('2026-04-01T00:00:00.000Z');
  });
});
