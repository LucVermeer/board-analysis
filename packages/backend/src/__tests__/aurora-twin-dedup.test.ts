import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
    // The pull writes updated_at and aurora_synced_at from one `now()`, so a
    // freshly pulled row is never "locally edited". Leaving updated_at on its
    // defaultNow() would make every seeded row look edited and silently switch
    // off the payload comparison these tests exercise.
    updatedAt: CLIMBED_AT,
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

/**
 * The predicate is a SQL restatement of `payloadDiffersFromStored`'s column
 * list, and nothing in the type system pins the two together. Add a
 * user-visible column to the pull's comparison — the natural place to add one —
 * and the predicate would keep collapsing rows that now differ in it, hiding a
 * real ascent with no other test going red. This is the guard for that.
 */
describe('#3535 payload column list stays in step with the pull', () => {
  const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

  function sourceOf(relativePath: string): string {
    return readFileSync(repoRoot + relativePath, 'utf8');
  }

  function bodyBetween(source: string, startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker);
    expect(start, `missing marker ${startMarker}`).toBeGreaterThan(-1);
    const end = source.indexOf(endMarker, start);
    expect(end, `missing marker ${endMarker}`).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it('compares every column payloadDiffersFromStored compares', () => {
    const pullBody = bodyBetween(
      sourceOf('packages/aurora-sync/src/sync/apply-user-logbook.ts'),
      'function payloadDiffersFromStored',
      '\n}',
    );
    const predicateBody = bodyBetween(
      sourceOf('packages/db/src/queries/ticks/aurora-twin-dedup.ts'),
      'export function notAuroraTwinDuplicate',
      '\n}',
    );

    const pullColumns = new Set(Array.from(pullBody.matchAll(/\bstored\.(\w+)/g), (match) => match[1]));
    const predicateColumns = new Set(
      Array.from(predicateBody.matchAll(/\b(?:ticks|twin)\.(\w+)/g), (match) => match[1]),
    );

    // Sanity-check the extraction itself before trusting the comparison.
    expect(pullColumns.size).toBeGreaterThanOrEqual(10);

    const missing = [...pullColumns].filter((column) => !predicateColumns.has(column)).sort();
    expect(missing, 'columns the pull compares but the twin predicate ignores').toEqual([]);
  });
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

  /**
   * Editing the one visible tick drifts its payload away from the twins it is
   * hiding. `isLocallyEdited` then makes every later pull skip that row, so
   * payload parity is never restored and a strict payload rule would resurrect
   * the duplicates permanently — making it look like rating a send created
   * them. `updateTick` writes in place and knows nothing about the group, so
   * the predicate has to absorb this itself.
   */
  const localEdits: Array<[string, string]> = [
    ['rated', `quality = 5`],
    ['commented on', `comment = 'new beta'`],
    ['re-graded', `difficulty = 24`],
  ];

  for (const [action, assignment] of localEdits) {
    it(`stays collapsed after the visible tick is ${action}`, async () => {
      await insertTick({ auroraId: 'aur-1' });
      await insertTick({ auroraId: 'aur-2' });
      await insertTick({ auroraId: 'aur-3' });
      expect(await visibleAuroraIds()).toEqual(['aur-1']);

      // What updateTick does: writes the column and bumps updated_at past
      // aurora_synced_at.
      await db.execute(
        sql.raw(`UPDATE boardsesh_ticks SET ${assignment}, updated_at = now() WHERE aurora_id = 'aur-1'`),
      );

      expect(await visibleAuroraIds()).toEqual(['aur-1']);
      expect(await feedTotalCount()).toBe(1);
    });
  }

  it('surfaces a hidden twin that itself diverges, rather than swallowing the change', async () => {
    await insertTick({ auroraId: 'aur-1' });
    await insertTick({ auroraId: 'aur-2' });
    expect(await visibleAuroraIds()).toEqual(['aur-1']);

    // Only the SURVIVOR's local edits relax the payload rule. A hidden row that
    // diverges is a deliberate difference and must not be silently absorbed.
    await db.execute(
      sql`UPDATE boardsesh_ticks SET comment = 'other beta', updated_at = now() WHERE aurora_id = 'aur-2'`,
    );

    expect(await visibleAuroraIds()).toEqual(['aur-1', 'aur-2']);
  });

  it('keeps a logged attempt beside a send at the same instant, even once the attempt is edited', async () => {
    // Aurora's bids land in the same table as its ascents. `status` and
    // `aurora_type` sit outside the locally-edited relaxation precisely so an
    // edit on the smaller-id row can never let a send absorb a real attempt.
    await insertTick({ auroraId: 'aur-1', status: 'attempt', auroraType: 'bids', difficulty: null });
    await insertTick({ auroraId: 'aur-2' });
    expect(await visibleAuroraIds()).toEqual(['aur-1', 'aur-2']);

    await db.execute(sql`UPDATE boardsesh_ticks SET quality = 5, updated_at = now() WHERE aurora_id = 'aur-1'`);

    expect(await visibleAuroraIds()).toEqual(['aur-1', 'aur-2']);
    expect(await feedTotalCount()).toBe(2);
  });

  it('keeps a bids row beside an ascents row that matches it in every other column', async () => {
    await insertTick({ auroraId: 'aur-1', auroraType: 'bids' });
    await insertTick({ auroraId: 'aur-2', auroraType: 'ascents' });

    expect(await visibleAuroraIds()).toEqual(['aur-1', 'aur-2']);
  });

  it('resurfaces the twins when the survivor is moved off the natural key (recorded behaviour)', async () => {
    await insertTick({ auroraId: 'aur-1' });
    await insertTick({ auroraId: 'aur-2' });
    expect(await visibleAuroraIds()).toEqual(['aur-1']);

    // `updateTick` also accepts `angle` and `climbedAt`. Either moves the
    // survivor out of the group entirely, so the rows it was hiding come back —
    // the relaxation only covers payload columns. Recorded, not fixed — #4060.
    await db.execute(
      sql`UPDATE boardsesh_ticks SET angle = ${ANGLE + 5}, updated_at = now() WHERE aurora_id = 'aur-1'`,
    );

    expect(await visibleAuroraIds()).toEqual(['aur-1', 'aur-2']);
  });

  it('reveals the next twin when the visible tick is deleted (recorded behaviour)', async () => {
    await insertTick({ auroraId: 'aur-1' });
    await insertTick({ auroraId: 'aur-2' });
    expect(await visibleAuroraIds()).toEqual(['aur-1']);

    // deleteTick removes one row. The group is unaware of it, so the next id is
    // promoted and the entry stays on screen. Known limitation, recorded here
    // so a future reader does not mistake it for a predicate bug; the honest
    // fix is a group-aware delete, tracked in #4059.
    await db.execute(sql`DELETE FROM boardsesh_ticks WHERE aurora_id = 'aur-1'`);

    expect(await visibleAuroraIds()).toEqual(['aur-2']);
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
