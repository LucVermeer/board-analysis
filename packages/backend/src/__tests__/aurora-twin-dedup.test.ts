import { beforeAll, afterEach, describe, expect, it } from 'vite-plus/test';
import { sql } from 'drizzle-orm';
import { applyAuroraAscents } from '@boardsesh/aurora-sync/apply-user-logbook';
import { db } from '../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { tickQueries } from '../graphql/resolvers/ticks/queries';
import { setupWorkerDatabase } from './worker-db';

/**
 * #3535 — Aurora itself stores some ascents two-to-four times, each copy with
 * its own real upstream uuid, so the aurora_id-keyed pull imports every copy as
 * its own tick and the climber's logbook shows one send 2-4×.
 *
 * These run against the real worker Postgres because the fix IS a SQL
 * predicate: a stub that re-states the condition in JS would assert its own
 * copy of the rule and stay green through any change to the shipped SQL.
 *
 * Revert `notAuroraTwinDuplicate` out of the resolvers and the collapse,
 * survivor-stability, tombstone-promotion and second-cycle read assertions all
 * fail; loosen the rule to day granularity or drop a payload column from it and
 * the "keeps genuinely different sends" cases fail.
 */

const USER_ID = 'twin3535-user';
const BOARD = 'tension';
const CLIMB_UUID = 'twin3535-climb-uuid';
const CLIMB_NAME = 'Twin Test Climb';
const ANGLE = 40;
// Millisecond-precision instant: the twins share it exactly.
const CLIMBED_AT = '2026-05-01T18:22:37.000Z';

type TickOverrides = Partial<typeof dbSchema.boardseshTicks.$inferInsert>;

/** Stable ordering for assertions; a native tick's NULL aurora_id sorts last. */
function byAuroraId(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}

let tickSeq = 0;

async function insertTick(overrides: TickOverrides = {}): Promise<void> {
  tickSeq += 1;
  await db.insert(dbSchema.boardseshTicks).values({
    uuid: `twin3535-tick-${tickSeq}`,
    userId: USER_ID,
    boardType: BOARD,
    climbUuid: CLIMB_UUID,
    angle: ANGLE,
    isMirror: false,
    origin: 'aurora_pull',
    status: 'send',
    attemptCount: 2,
    quality: 3,
    difficulty: 21,
    isBenchmark: false,
    comment: 'crimpy',
    climbedAt: CLIMBED_AT,
    auroraType: 'ascents',
    auroraSyncedAt: CLIMBED_AT,
    ...overrides,
  });
}

/** aurora_ids the public per-user tick list (the You page's source) shows. */
async function visibleAuroraIds(): Promise<Array<string | null>> {
  const rows = (await tickQueries.userTicks(null, { userId: USER_ID, boardType: BOARD })) as Array<{
    auroraId: string | null;
  }>;
  return rows.map((row) => row.auroraId).sort(byAuroraId);
}

/** Rows actually stored, regardless of what the read paths show. */
async function storedAuroraIds(): Promise<string[]> {
  const rows = await db
    .select({ auroraId: dbSchema.boardseshTicks.auroraId })
    .from(dbSchema.boardseshTicks)
    .where(sql`user_id = ${USER_ID}`);
  return rows.map((row) => row.auroraId ?? '').sort(byAuroraId);
}

async function feedTotalCount(): Promise<number> {
  const feed = await tickQueries.userAscentsFeed(null, { userId: USER_ID, input: { boardType: BOARD } });
  return feed.totalCount;
}

beforeAll(async () => {
  await setupWorkerDatabase();
  await db.execute(sql`
    INSERT INTO users (id, email, name, created_at, updated_at)
    VALUES (${USER_ID}, ${USER_ID + '@test.com'}, 'Twin Tester', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO board_climbs (uuid, board_type, layout_id, setter_username, name, frames, frames_count, is_draft, is_listed, edge_left, edge_right, edge_bottom, edge_top, created_at)
    VALUES (${CLIMB_UUID}, ${BOARD}, 1, 'test-setter', ${CLIMB_NAME}, 'p1r1', 1, false, true, 0, 100, 0, 150, '2024-01-01')
    ON CONFLICT (uuid) DO NOTHING
  `);
});

afterEach(async () => {
  await db.execute(sql`DELETE FROM boardsesh_ticks WHERE user_id = ${USER_ID}`);
});

describe('#3535 Aurora-side duplicate ascents', () => {
  it('shows one tick per twin group and keeps the lowest aurora_id', async () => {
    await insertTick({ auroraId: 'aur-3' });
    await insertTick({ auroraId: 'aur-1' });
    await insertTick({ auroraId: 'aur-2' });

    expect(await storedAuroraIds()).toEqual(['aur-1', 'aur-2', 'aur-3']);
    expect(await visibleAuroraIds()).toEqual(['aur-1']);
    expect(await feedTotalCount()).toBe(1);

    const counts = await tickQueries.userTickCountsByBoard(null, { userId: USER_ID });
    expect(counts).toEqual([{ boardType: BOARD, count: 1 }]);
  });

  it('picks the same survivor whatever order the payload arrived in', async () => {
    await insertTick({ auroraId: 'aur-1' });
    await insertTick({ auroraId: 'aur-2' });
    await insertTick({ auroraId: 'aur-3' });

    // created_at is not the tiebreak: here the smallest aurora_id is also the
    // OLDEST row, in the previous test it was the newest, and both give aur-1.
    expect(await visibleAuroraIds()).toEqual(['aur-1']);
  });

  it('collapses the grouped (per-day) feed to one entry too', async () => {
    await insertTick({ auroraId: 'aur-1' });
    await insertTick({ auroraId: 'aur-2' });

    const grouped = (await tickQueries.userGroupedAscentsFeed(null, {
      userId: USER_ID,
      input: { boardType: BOARD },
    })) as { groups: Array<{ items: unknown[]; sendCount: number }>; totalCount: number };

    expect(grouped.totalCount).toBe(1);
    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups[0].items).toHaveLength(1);
    // The per-group tally is built from the same fetch, so it counts once too.
    expect(grouped.groups[0].sendCount).toBe(1);
  });

  const differingPayloads: Array<[string, TickOverrides]> = [
    ['comment', { comment: 'different beta' }],
    ['quality', { quality: 5 }],
    ['difficulty', { difficulty: 22 }],
    ['is_mirror', { isMirror: true }],
    ['attempt_count', { attemptCount: 7 }],
    ['status', { status: 'flash' }],
    ['is_benchmark', { isBenchmark: true }],
  ];

  for (const [field, overrides] of differingPayloads) {
    it(`keeps both sends when they differ in ${field}`, async () => {
      await insertTick({ auroraId: 'aur-1' });
      await insertTick({ auroraId: 'aur-2', ...overrides });

      expect(await visibleAuroraIds()).toEqual(['aur-1', 'aur-2']);
      expect(await feedTotalCount()).toBe(2);
    });
  }

  it('keeps two sends logged one millisecond apart (no tolerance window)', async () => {
    await insertTick({ auroraId: 'aur-1', climbedAt: '2026-05-01T18:22:37.000Z' });
    await insertTick({ auroraId: 'aur-2', climbedAt: '2026-05-01T18:22:37.001Z' });

    expect(await visibleAuroraIds()).toEqual(['aur-1', 'aur-2']);
  });

  it('keeps two sends of the same climb on the same day', async () => {
    await insertTick({ auroraId: 'aur-1', climbedAt: '2026-05-01T09:00:00.000Z' });
    await insertTick({ auroraId: 'aur-2', climbedAt: '2026-05-01T19:30:00.000Z' });

    expect(await visibleAuroraIds()).toEqual(['aur-1', 'aur-2']);
  });

  it('never hides a native tick, and is never hidden by one', async () => {
    await insertTick({ auroraId: null, origin: 'native', auroraType: null, auroraSyncedAt: null });
    await insertTick({ auroraId: 'aur-2' });

    // byAuroraId puts the native row's NULL aurora_id last.
    expect(await visibleAuroraIds()).toEqual(['aur-2', null]);
  });

  it('never treats a json-import surrogate id as a real Aurora twin', async () => {
    await insertTick({ auroraId: 'json-import-aaa', origin: 'json_import' });
    await insertTick({ auroraId: 'zzz-real-aurora-id' });

    expect(await visibleAuroraIds()).toEqual(['json-import-aaa', 'zzz-real-aurora-id']);
  });

  it('never hides a second real Kilter link', async () => {
    await insertTick({ auroraId: 'aur-1', kilterId: 'kil-1' });
    await insertTick({ auroraId: 'aur-2', kilterId: 'kil-2' });

    expect(await visibleAuroraIds()).toEqual(['aur-1', 'aur-2']);
  });

  it('promotes the next id when Aurora tombstones the survivor', async () => {
    await insertTick({ auroraId: 'aur-1' });
    await insertTick({ auroraId: 'aur-2' });
    await insertTick({ auroraId: 'aur-3' });
    expect(await visibleAuroraIds()).toEqual(['aur-1']);

    // The tombstone path deletes the pull-owned row for that aurora_id.
    await db.execute(sql`DELETE FROM boardsesh_ticks WHERE aurora_id = 'aur-1'`);

    expect(await visibleAuroraIds()).toEqual(['aur-2']);
    expect(await feedTotalCount()).toBe(1);
  });

  it('applies the same duplicate payload twice with no second-cycle churn', async () => {
    const auroraIds = ['aur-b', 'aur-a', 'aur-c'];
    const payload = auroraIds.map((auroraId) => ({
      uuid: auroraId,
      climb_uuid: CLIMB_UUID,
      angle: ANGLE,
      is_mirror: false,
      attempt_id: 2,
      bid_count: 2,
      quality: null,
      difficulty: 21,
      is_benchmark: false,
      comment: 'crimpy',
      climbed_at: '2026-05-01 18:22:37',
      created_at: '2026-05-01 18:25:00',
      is_listed: true,
    }));

    const applyDb = db as unknown as Parameters<typeof applyAuroraAscents>[0];

    await applyAuroraAscents(applyDb, BOARD, USER_ID, payload);
    const afterFirst = await db
      .select({ uuid: dbSchema.boardseshTicks.uuid, auroraId: dbSchema.boardseshTicks.auroraId })
      .from(dbSchema.boardseshTicks)
      .where(sql`user_id = ${USER_ID}`);

    // Every real aurora_id is stored — the fix hides a twin, it never drops one.
    expect(afterFirst.map((row) => row.auroraId).sort(byAuroraId)).toEqual(['aur-a', 'aur-b', 'aur-c']);
    expect(await visibleAuroraIds()).toEqual(['aur-a']);

    // Second cycle: identical payload, as an incremental re-pull would deliver.
    await applyAuroraAscents(applyDb, BOARD, USER_ID, payload);
    const afterSecond = await db
      .select({ uuid: dbSchema.boardseshTicks.uuid, auroraId: dbSchema.boardseshTicks.auroraId })
      .from(dbSchema.boardseshTicks)
      .where(sql`user_id = ${USER_ID}`);

    // No re-insert, no resurrection, same row identities: the second cycle is a
    // no-op. A delete-the-loser fix would fail here — the deleted row's real
    // aurora_id is a miss on every later pull and comes straight back.
    expect(afterSecond.map((row) => row.auroraId).sort(byAuroraId)).toEqual(['aur-a', 'aur-b', 'aur-c']);
    expect(new Set(afterSecond.map((row) => row.uuid))).toEqual(new Set(afterFirst.map((row) => row.uuid)));
    expect(await visibleAuroraIds()).toEqual(['aur-a']);
    expect(await feedTotalCount()).toBe(1);
  });
});
