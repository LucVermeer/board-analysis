import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

// Captured SQL fragments per call to tx.execute.
const executedSql: string[] = [];

const { mockDb } = vi.hoisted(() => {
  // The `sql` template returns an object whose `.queryChunks` array holds the
  // alternating raw SQL strings and parameter sentinels. For assertion
  // purposes we just need the raw text — so we stitch the chunks back into a
  // single string, dropping placeholders.
  return {
    mockDb: {
      transaction: vi.fn(),
    },
  };
});

vi.mock('../db/client', () => ({
  db: mockDb,
}));

import { recomputeClimbStats } from '../graphql/resolvers/ticks/recompute-climb-stats';

function chainStub(): { insert: ReturnType<typeof vi.fn>; execute: ReturnType<typeof vi.fn> } {
  const chain: Record<string, unknown> = {};
  for (const method of ['values', 'onConflictDoNothing']) {
    chain[method] = vi.fn(() => chain);
  }
  return {
    insert: vi.fn(() => chain),
    execute: vi.fn(async (query: unknown) => {
      // Drizzle's sql template exposes `queryChunks` or `.toSQL()`. Use a
      // best-effort serialize that walks the object's string-like fields.
      const stringified = JSON.stringify(query);
      executedSql.push(stringified);
      return [];
    }),
  };
}

describe('recomputeClimbStats', () => {
  beforeEach(() => {
    executedSql.length = 0;
    vi.clearAllMocks();
  });

  it('seeds the stats row with explicit aurora=0 and boardsesh=0', async () => {
    let capturedSeedValues: unknown = null;
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
      const insertChain = {
        onConflictDoNothing: vi.fn(),
      };
      const tx = {
        insert: vi.fn(() => ({
          values: vi.fn((values: unknown) => {
            capturedSeedValues = values;
            return insertChain;
          }),
        })),
        execute: vi.fn(async () => []),
      };
      await callback(tx);
    });

    await recomputeClimbStats('kilter', 'CLIMB-1', 40);

    expect(capturedSeedValues).toMatchObject({
      boardType: 'kilter',
      climbUuid: 'CLIMB-1',
      angle: 40,
      ascensionistCount: 0,
      auroraAscensionistCount: 0,
      boardseshAscensionistCount: 0,
    });
  });

  it('runs the recompute SQL inside a single transaction', async () => {
    let executeCount = 0;
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
      const tx = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({ onConflictDoNothing: vi.fn() })),
        })),
        execute: vi.fn(async () => {
          executeCount += 1;
          return [];
        }),
      };
      await callback(tx);
    });

    await recomputeClimbStats('kilter', 'CLIMB-1', 40);

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(executeCount).toBe(1);
  });

  it('emits the SQL that COALESCEs distinct_senders to 0 (delete-last-tick path)', async () => {
    let capturedQuery: unknown = null;
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
      const tx = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({ onConflictDoNothing: vi.fn() })),
        })),
        execute: vi.fn(async (query: unknown) => {
          capturedQuery = query;
          return [];
        }),
      };
      await callback(tx);
    });

    await recomputeClimbStats('kilter', 'CLIMB-1', 40);

    // Drizzle's `sql` template returns an object with `queryChunks` (the
    // alternating raw fragments and parameter sentinels). Stitch the string
    // chunks together so we can grep the structure.
    type DrizzleSql = { queryChunks?: Array<unknown> };
    const chunks = (capturedQuery as DrizzleSql).queryChunks ?? [];
    const sql = chunks
      .filter((c): c is { value?: string[] } => typeof c === 'object' && c !== null)
      .flatMap((c) => c.value ?? [])
      .join('');

    // Hard invariants the delete-last-tick path depends on:
    // 1. boardsesh_ascensionist_count defaults to 0 when no senders remain.
    expect(sql).toMatch(/boardsesh_ascensionist_count\s*=\s*COALESCE\(agg\.distinct_senders,\s*0\)/);
    // 2. ascensionist_count is the materialized sum (defaulted to 0 on each side).
    expect(sql).toContain('COALESCE(s.aurora_ascensionist_count, 0)');
    expect(sql).toContain('COALESCE(agg.distinct_senders, 0)');
    // 3. The ticks filter is sargable — predicate on WHERE, not FILTER.
    expect(sql).toMatch(/WHERE[\s\S]*bt\.status IN \('flash','send'\)/);
    // 4. Ownership-aware FA: Boardsesh climbs re-derive every pass.
    expect(sql).toContain('user_id IS NOT NULL');
    expect(sql).toContain('agg.first_user');
    expect(sql).toContain('agg.first_at');
  });
});
