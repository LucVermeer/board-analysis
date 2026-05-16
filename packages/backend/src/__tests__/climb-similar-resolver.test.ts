/**
 * Wiring tests for the climbQueries.similarClimbs resolver. The underlying
 * findSimilarClimbs helper has its own unit coverage in
 * climb-similarity.test.ts; here we exercise the *router* — which input path
 * runs (climbUuid → DB lookup vs frames → parser), how the excludeUuid is
 * propagated, and how the early-return / invalid-input cases behave.
 *
 * findSimilarClimbs itself is mocked so a regression in its signature would
 * show up here as a call-arg mismatch rather than a DB integration error.
 */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { ConnectionContext } from '@boardsesh/shared-schema';

const { mockDb, findSimilarClimbsMock, parseFramesToHoldEntriesMock } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    execute: vi.fn(),
  },
  findSimilarClimbsMock: vi.fn(),
  parseFramesToHoldEntriesMock: vi.fn(),
}));

vi.mock('../db/client', () => ({ db: mockDb }));

vi.mock('../graphql/resolvers/climbs/climb-similarity', async () => {
  // Pull through everything else (CLIMB_DUPLICATE_ERROR_CODE etc.) so other
  // modules that import from this same path are unaffected.
  const actual = await vi.importActual<typeof import('../graphql/resolvers/climbs/climb-similarity')>(
    '../graphql/resolvers/climbs/climb-similarity',
  );
  return {
    ...actual,
    findSimilarClimbs: findSimilarClimbsMock,
    parseFramesToHoldEntries: parseFramesToHoldEntriesMock,
  };
});

vi.mock('../utils/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('../utils/redis-rate-limiter', () => ({
  checkRateLimitRedis: vi.fn().mockResolvedValue(undefined),
}));

import { climbQueries } from '../graphql/resolvers/climbs/queries';

function makeCtx(overrides: Partial<ConnectionContext> = {}): ConnectionContext {
  return {
    connectionId: 'conn-1',
    isAuthenticated: false,
    sessionId: null,
    boardPath: null,
    controllerId: null,
    controllerApiKey: null,
    ...overrides,
  } as ConnectionContext;
}

function mockSelectChain(rows: Array<{ holdId: number; holdState: string }>) {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}

describe('climbQueries.similarClimbs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findSimilarClimbsMock.mockReset();
    parseFramesToHoldEntriesMock.mockReset();
    findSimilarClimbsMock.mockResolvedValue([]);
    mockDb.select.mockReset();
  });

  it('rejects invalid board names before reaching the helper', async () => {
    await expect(
      climbQueries.similarClimbs({}, { input: { boardType: 'not-a-board', layoutId: 1, climbUuid: 'x' } }, makeCtx()),
    ).rejects.toThrow();
    expect(findSimilarClimbsMock).not.toHaveBeenCalled();
  });

  it('rejects input that supplies neither climbUuid nor frames', async () => {
    // SimilarClimbsInputSchema's refine() requires exactly one — Zod throws.
    await expect(
      climbQueries.similarClimbs({}, { input: { boardType: 'kilter', layoutId: 1 } }, makeCtx()),
    ).rejects.toThrow();
    expect(findSimilarClimbsMock).not.toHaveBeenCalled();
  });

  it('climbUuid path reads the target climbs holds and passes them through with excludeUuid set to the target', async () => {
    mockDb.select.mockReturnValueOnce(
      mockSelectChain([
        { holdId: 4122, holdState: 'STARTING' },
        { holdId: 4182, holdState: 'HAND' },
      ]),
    );

    await climbQueries.similarClimbs(
      {},
      {
        input: {
          boardType: 'kilter',
          layoutId: 8,
          climbUuid: 'target-uuid',
          threshold: 0.7,
          limit: 5,
        },
      },
      makeCtx(),
    );

    expect(findSimilarClimbsMock).toHaveBeenCalledTimes(1);
    const args = findSimilarClimbsMock.mock.calls[0][0];
    expect(args).toMatchObject({
      boardType: 'kilter',
      layoutId: 8,
      threshold: 0.7,
      limit: 5,
      // The target climbs uuid must always be excluded from its own similar
      // list — otherwise it would always rank itself at 100% match.
      excludeUuid: 'target-uuid',
    });
    expect(args.holds).toEqual([
      { holdId: 4122, holdState: 'STARTING' },
      { holdId: 4182, holdState: 'HAND' },
    ]);
    // parseFramesToHoldEntries must NOT have been called on the climbUuid path.
    expect(parseFramesToHoldEntriesMock).not.toHaveBeenCalled();
  });

  it('frames path parses the frames input and forwards excludeClimbUuid verbatim', async () => {
    parseFramesToHoldEntriesMock.mockReturnValueOnce([
      { frameNumber: 0, holdId: 9001, holdState: 'STARTING' },
      { frameNumber: 0, holdId: 9002, holdState: 'HAND' },
    ]);

    await climbQueries.similarClimbs(
      {},
      {
        input: {
          boardType: 'tension',
          layoutId: 11,
          frames: 'p9001r1p9002r2',
          excludeClimbUuid: 'caller-supplied-exclude',
        },
      },
      makeCtx(),
    );

    expect(parseFramesToHoldEntriesMock).toHaveBeenCalledWith('tension', 'p9001r1p9002r2');
    expect(findSimilarClimbsMock).toHaveBeenCalledTimes(1);
    const args = findSimilarClimbsMock.mock.calls[0][0];
    expect(args).toMatchObject({
      boardType: 'tension',
      layoutId: 11,
      // The frames path keeps the caller-supplied excludeClimbUuid as-is
      // rather than overriding it — there is no candidate uuid to exclude.
      excludeUuid: 'caller-supplied-exclude',
    });
    expect(args.holds).toHaveLength(2);
    // Db.select must NOT have been called on the frames path.
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('short-circuits to an empty array when the target has no holds, without calling the helper', async () => {
    mockDb.select.mockReturnValueOnce(mockSelectChain([]));

    const result = await climbQueries.similarClimbs(
      {},
      { input: { boardType: 'kilter', layoutId: 8, climbUuid: 'empty-uuid' } },
      makeCtx(),
    );

    expect(result).toEqual([]);
    expect(findSimilarClimbsMock).not.toHaveBeenCalled();
  });
});
