import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

/**
 * saveAscent idempotency (PR #3555 review finding 1).
 *
 * The old code upserted on a fake aurora_id (= the client-minted options.uuid),
 * so client retries deduped. PR4 removed the fake provenance; these tests pin
 * the replacement dedup: the client uuid IS the tick uuid, the insert carries
 * an onConflictDoUpdate targeting boardsesh_ticks.uuid, and a double-POST
 * therefore lands on the same row (second call updates, never duplicates).
 * The conflict update must not touch origin or the sync markers, and its
 * setWhere must pin the update to rows owned by the calling user.
 */

type InsertCall = {
  values: Record<string, unknown>;
  conflict: {
    target: unknown;
    set: Record<string, unknown>;
    setWhere: unknown;
  } | null;
};

const insertCalls: InsertCall[] = [];

vi.mock('@/app/lib/db/db', () => ({
  dbz: {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        const call: InsertCall = { values, conflict: null };
        insertCalls.push(call);
        return {
          onConflictDoUpdate: (conflict: InsertCall['conflict']) => {
            call.conflict = conflict;
            return Promise.resolve();
          },
        };
      },
    }),
  },
}));

import { boardseshTicks } from '@/app/lib/db/schema';
import { saveAscent } from '../saveAscent';
import type { SaveAscentOptions } from '../types';

const CLIENT_UUID = '0B2BADB3C1E24A9DB021E5180F4B4C93';

function options(overrides: Partial<SaveAscentOptions> = {}): SaveAscentOptions {
  return {
    uuid: CLIENT_UUID,
    user_id: 123,
    climb_uuid: 'climb-1',
    angle: 40,
    is_mirror: false,
    attempt_id: 1,
    bid_count: 1,
    quality: 3,
    difficulty: 20,
    is_benchmark: false,
    comment: 'crimpy',
    climbed_at: '2026-07-01T10:00:00.000Z',
    ...overrides,
  } as SaveAscentOptions;
}

beforeEach(() => {
  insertCalls.length = 0;
});

describe('saveAscent — idempotent upsert on the client uuid', () => {
  it('uses the client-minted uuid as the tick uuid with origin native and NO aurora_id', async () => {
    await saveAscent('kilter', 'token', options(), 'user-1');

    expect(insertCalls).toHaveLength(1);
    const { values } = insertCalls[0];
    expect(values.uuid).toBe(CLIENT_UUID);
    expect(values.origin).toBe('native');
    expect(values.auroraId).toBeNull();
    expect(values.userId).toBe('user-1');
    // UTC instant, not server-local wall time.
    expect(values.climbedAt).toBe('2026-07-01T10:00:00.000Z');
  });

  it('defensively pins an Aurora-style naive climbed_at to UTC (normalizeTimestamp), never server-local', async () => {
    await saveAscent('kilter', 'token', options({ climbed_at: '2026-07-01 10:00:00' }), 'user-1');

    // Identical instant to the ISO form above, regardless of the host TZ.
    expect(insertCalls[0].values.climbedAt).toBe('2026-07-01T10:00:00.000Z');
  });

  it('targets boardsesh_ticks.uuid on conflict so a double-POST updates the same row (no duplicate)', async () => {
    // Two identical POSTs (client retry).
    await saveAscent('kilter', 'token', options(), 'user-1');
    await saveAscent('kilter', 'token', options(), 'user-1');

    expect(insertCalls).toHaveLength(2);
    for (const call of insertCalls) {
      // Same deterministic uuid on both attempts — the DB unique index plus
      // this conflict target collapses them onto one row.
      expect(call.values.uuid).toBe(CLIENT_UUID);
      expect(call.conflict).not.toBeNull();
      expect(call.conflict?.target).toBe(boardseshTicks.uuid);
    }
  });

  it('conflict update touches content columns only — never origin or sync markers', async () => {
    await saveAscent('kilter', 'token', options(), 'user-1');

    const conflictSet = insertCalls[0].conflict?.set ?? {};
    expect(Object.keys(conflictSet).sort()).toEqual(
      [
        'angle',
        'attemptCount',
        'boardType',
        'climbUuid',
        'climbedAt',
        'comment',
        'difficulty',
        'isBenchmark',
        'isMirror',
        'quality',
        'status',
        'updatedAt',
      ].sort(),
    );
    // A retry after the pull's cross-source claim must not clobber provenance.
    expect(conflictSet).not.toHaveProperty('origin');
    expect(conflictSet).not.toHaveProperty('auroraId');
    expect(conflictSet).not.toHaveProperty('auroraSyncedAt');
    expect(conflictSet).not.toHaveProperty('kilterId');
    expect(conflictSet).not.toHaveProperty('uuid');
  });

  it('guards the conflict update with a user-ownership setWhere (no cross-user overwrite)', async () => {
    await saveAscent('kilter', 'token', options(), 'user-1');

    const setWhere = insertCalls[0].conflict?.setWhere;
    expect(setWhere).toBeDefined();
    // The SQL fragment must compare user_id against the calling user; a uuid
    // collision with another user's tick then filters the update to zero rows.
    // Walk the drizzle SQL chunks (JSON.stringify chokes on the Column→table
    // circular reference).
    const chunks = (setWhere as { queryChunks: unknown[] }).queryChunks;
    // Column chunks carry .name; a raw bound value is stored as the string
    // chunk itself (drizzle parameterises it at serialisation time).
    const referencesUserIdColumn = chunks.some((chunk) => (chunk as { name?: string } | null)?.name === 'user_id');
    const bindsCallingUser = chunks.some((chunk) => chunk === 'user-1');
    expect(referencesUserIdColumn).toBe(true);
    expect(bindsCallingUser).toBe(true);
  });

  it('setWhere skips the update when content is unchanged so an idempotent retry never bumps updated_at', async () => {
    await saveAscent('kilter', 'token', options(), 'user-1');

    const setWhere = insertCalls[0].conflict?.setWhere as SQL;
    const rendered = new PgDialect().sqlToQuery(setWhere).sql;
    // The guard must include an IS DISTINCT FROM change-detection over content
    // columns. Without it, a byte-identical double-POST after the background
    // pull set aurora_synced_at would rewrite updated_at, making updated_at >
    // aurora_synced_at and tripping the Aurora edit-clobber guard into skipping
    // all future upstream changes.
    expect(rendered).toMatch(/IS DISTINCT FROM excluded\./);
    // The comparison must cover the mutable content columns, not just one.
    for (const col of ['status', 'quality', 'comment', 'climbed_at']) {
      expect(rendered).toContain(`excluded.${col}`);
    }
  });
});
