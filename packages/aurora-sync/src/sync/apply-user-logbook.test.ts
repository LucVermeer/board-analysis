import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub only the stats recompute; keep the offset-inference helpers real so the
// cross-source claim exercises the actual matching logic.
vi.mock('@boardsesh/db/queries', async (importActual) => {
  const actual = await importActual<typeof import('@boardsesh/db/queries')>();
  return { ...actual, recomputeClimbStatsBulk: vi.fn() };
});

import { recomputeClimbStatsBulk } from '@boardsesh/db/queries';
import { applyAuroraAscents, applyAuroraBids } from './apply-user-logbook';

const recomputeMock = vi.mocked(recomputeClimbStatsBulk);

type CallRecord = { kind: 'select' | 'delete' | 'update' | 'insert' | 'execute'; args: unknown[] };
type Row = Record<string, unknown>;

/**
 * Hand-rolled Drizzle-tx shim, same philosophy as the kilter-sync suite: no
 * real DB, records every call, returns seeded SELECT results in order.
 */
function createTx(opts: { selectResults?: Row[][] } = {}) {
  const calls: CallRecord[] = [];
  const selectResults = opts.selectResults ?? [];
  let selectIdx = 0;
  const insertValues: Row[][] = [];

  const tx = {
    select(cols: unknown) {
      calls.push({ kind: 'select', args: [cols] });
      const next = selectResults[selectIdx++] ?? [];
      return { from: (_t: unknown) => ({ where: (_c: unknown) => Promise.resolve(next) }) };
    },
    delete(_t: unknown) {
      return {
        where: (cond: unknown) => {
          calls.push({ kind: 'delete', args: [cond] });
          return Promise.resolve();
        },
      };
    },
    update(_t: unknown) {
      return {
        set: (setValues: Row) => ({
          where: (cond: unknown) => {
            calls.push({ kind: 'update', args: [setValues, cond] });
            return Promise.resolve();
          },
        }),
      };
    },
    insert(_t: unknown) {
      return {
        values: (rows: Row[]) => {
          calls.push({ kind: 'insert', args: [rows] });
          insertValues.push(rows);
          return Promise.resolve();
        },
      };
    },
    execute(query: unknown) {
      calls.push({ kind: 'execute', args: [query] });
      return Promise.resolve([]);
    },
  };

  return { tx, calls, insertValues };
}

type Db = Parameters<typeof applyAuroraAscents>[0];

function ascent(overrides: Row = {}): Row {
  return {
    uuid: 'aur-1',
    climb_uuid: 'climb-1',
    angle: 40,
    is_mirror: false,
    attempt_id: 2,
    bid_count: 3,
    quality: 3,
    difficulty: 20,
    is_benchmark: false,
    is_listed: true,
    comment: '',
    climbed_at: '2026-05-01 22:00:00',
    created_at: '2026-05-01 22:05:00',
    ...overrides,
  };
}

beforeEach(() => recomputeMock.mockClear());

describe('applyAuroraAscents — timezone + insert', () => {
  it('stores climbed_at as UTC ISO (naive Aurora string pinned to UTC, not server-local)', async () => {
    const { tx, insertValues, calls } = createTx({ selectResults: [[], []] });
    await applyAuroraAscents(tx as unknown as Db, 'kilter', 'user-1', [ascent()]);

    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(1);
    const row = insertValues[0][0];
    // "2026-05-01 22:00:00" is UTC → exactly this instant, regardless of host TZ.
    expect(row.climbedAt).toBe('2026-05-01T22:00:00.000Z');
    expect(row.createdAt).toBe('2026-05-01T22:05:00.000Z');
    expect(row).toMatchObject({
      auroraId: 'aur-1',
      origin: 'aurora_pull',
      status: 'send',
      attemptCount: 3,
      // raw Aurora quality 3 → Boardsesh 5.
      quality: 5,
      auroraType: 'ascents',
    });
    expect(recomputeMock).toHaveBeenCalledTimes(1);
  });
});

describe('applyAuroraAscents — cross-source claim', () => {
  it('claims an existing json_import row instead of inserting a twin (same UTC climbed_at)', async () => {
    const { tx, calls, insertValues } = createTx({
      selectResults: [
        [], // byAuroraId miss (new real uuid)
        [
          {
            uuid: 'tick-json',
            climbUuid: 'climb-1',
            angle: 40,
            climbedAt: '2026-05-01T22:00:00.000Z', // identical instant after normalize
            status: 'send',
          },
        ],
      ],
    });

    await applyAuroraAscents(tx as unknown as Db, 'kilter', 'user-1', [ascent()]);

    // Claim UPDATE (execute), no insert twin.
    expect(calls.filter((c) => c.kind === 'execute')).toHaveLength(1);
    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(0);
    expect(insertValues).toHaveLength(0);
  });

  it('claims a timezone-shifted json_import original via the inferred offset', async () => {
    // Existing original 10h ahead (pre-fix shifted); the pull is honest UTC.
    const { tx, calls, insertValues } = createTx({
      selectResults: [
        [],
        [
          {
            uuid: 'tick-json',
            climbUuid: 'climb-1',
            angle: 40,
            climbedAt: '2026-05-02T08:00:00.000Z', // +10h vs the incoming 22:00Z
            status: 'send',
          },
        ],
      ],
    });

    await applyAuroraAscents(tx as unknown as Db, 'kilter', 'user-1', [ascent()]);

    expect(calls.filter((c) => c.kind === 'execute')).toHaveLength(1);
    expect(insertValues).toHaveLength(0);
  });
});

describe('applyAuroraAscents — is_listed soft-delete', () => {
  it('deletes a pull-owned (aurora_pull) row on is_listed=false', async () => {
    const { tx, calls } = createTx({
      selectResults: [[{ uuid: 'tick-pull', climbUuid: 'climb-1', angle: 40, origin: 'aurora_pull' }]],
    });

    await applyAuroraAscents(tx as unknown as Db, 'kilter', 'user-1', [ascent({ is_listed: false })]);

    expect(calls.filter((c) => c.kind === 'delete')).toHaveLength(1);
    expect(calls.filter((c) => c.kind === 'update')).toHaveLength(0);
    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(0);
    expect(recomputeMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a claimed native/json_import row but clears its aurora markers on is_listed=false', async () => {
    const { tx, calls } = createTx({
      selectResults: [[{ uuid: 'tick-native', climbUuid: 'climb-1', angle: 40, origin: 'native' }]],
    });

    await applyAuroraAscents(tx as unknown as Db, 'kilter', 'user-1', [ascent({ is_listed: false })]);

    expect(calls.filter((c) => c.kind === 'delete')).toHaveLength(0);
    const updates = calls.filter((c) => c.kind === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toMatchObject({
      auroraId: null,
      auroraType: null,
      auroraSyncedAt: null,
      auroraSyncError: null,
    });
  });
});

describe('applyAuroraAscents — edit-clobber guard', () => {
  it('does not overwrite a locally-edited row on a by-aurora-id re-sync', async () => {
    const { tx, calls } = createTx({
      selectResults: [
        [
          {
            uuid: 'tick-1',
            auroraId: 'aur-1',
            climbUuid: 'climb-1',
            angle: 40,
            isMirror: false,
            status: 'send',
            attemptCount: 1, // differs from incoming (3) — a real change...
            quality: 5,
            difficulty: 20,
            isBenchmark: false,
            comment: '',
            climbedAt: '2026-05-01T22:00:00.000Z',
            updatedAt: '2026-05-02T00:00:00.000Z', // ...but locally edited after sync
            auroraSyncedAt: '2026-05-01T22:05:00.000Z',
            origin: 'aurora_pull',
          },
        ],
      ],
    });

    await applyAuroraAscents(tx as unknown as Db, 'kilter', 'user-1', [ascent()]);

    // No claim/update execute, no insert — the local edit is protected.
    expect(calls.filter((c) => c.kind === 'execute')).toHaveLength(0);
    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(0);
  });

  it('skips a no-op by-aurora-id re-sync (payload identical)', async () => {
    const { tx, calls } = createTx({
      selectResults: [
        [
          {
            uuid: 'tick-1',
            auroraId: 'aur-1',
            climbUuid: 'climb-1',
            angle: 40,
            isMirror: false,
            status: 'send',
            attemptCount: 3,
            quality: 5,
            difficulty: 20,
            isBenchmark: false,
            comment: '',
            climbedAt: '2026-05-01T22:00:00.000Z',
            updatedAt: '2026-05-01T22:05:00.000Z',
            auroraSyncedAt: '2026-05-01T22:05:00.000Z',
            origin: 'aurora_pull',
          },
        ],
      ],
    });

    await applyAuroraAscents(tx as unknown as Db, 'kilter', 'user-1', [ascent()]);

    expect(calls.filter((c) => c.kind === 'execute')).toHaveLength(0);
    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(0);
  });

  it('applies a real by-aurora-id change (quality edit upstream)', async () => {
    const { tx, calls } = createTx({
      selectResults: [
        [
          {
            uuid: 'tick-1',
            auroraId: 'aur-1',
            climbUuid: 'climb-1',
            angle: 40,
            isMirror: false,
            status: 'send',
            attemptCount: 3,
            quality: 3, // stored 3, incoming resolves to 5 → real change
            difficulty: 20,
            isBenchmark: false,
            comment: '',
            climbedAt: '2026-05-01T22:00:00.000Z',
            updatedAt: '2026-05-01T22:05:00.000Z',
            auroraSyncedAt: '2026-05-01T22:05:00.000Z',
            origin: 'aurora_pull',
          },
        ],
      ],
    });

    await applyAuroraAscents(tx as unknown as Db, 'kilter', 'user-1', [ascent()]);

    expect(calls.filter((c) => c.kind === 'execute')).toHaveLength(1);
    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(0);
  });
});

describe('applyAuroraBids', () => {
  it('inserts an attempt with UTC climbed_at and no tombstone handling', async () => {
    const { tx, insertValues, calls } = createTx({ selectResults: [[], []] });
    await applyAuroraBids(tx as unknown as Db, 'kilter', 'user-1', [
      {
        uuid: 'bid-1',
        climb_uuid: 'climb-2',
        angle: 25,
        is_mirror: false,
        bid_count: 2,
        comment: '',
        climbed_at: '2026-05-01 09:00:00',
        created_at: '2026-05-01 09:00:00',
      },
    ]);

    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(1);
    expect(insertValues[0][0]).toMatchObject({
      status: 'attempt',
      origin: 'aurora_pull',
      auroraType: 'bids',
      climbedAt: '2026-05-01T09:00:00.000Z',
      attemptCount: 2,
    });
  });
});
