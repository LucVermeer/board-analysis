import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql, type SQL } from 'drizzle-orm';
import { selfHealStaleClimbStats, recomputeClimbStatsBulk } from '@boardsesh/db/queries';
import { getWorkerDatabaseUrl, setupWorkerDatabase } from './worker-db';

// ---------------------------------------------------------------------------
// Recompute self-heal (real DB)
//
// selfHealStaleClimbStats finds keys where a flash/send tick's updated_at is
// newer than the board_climb_stats row it feeds — the signature of a debounced
// recompute a deploy dropped — within a recent lookback window, and re-derives
// them. All timestamps are seeded DB-side (now(), now() - interval) so they are
// consistent with the query's `now()` comparison regardless of DB timezone.
//
// A stale stats row is seeded by INSERTing an explicit old updated_at directly
// (there is no BEFORE INSERT trigger; the BEFORE UPDATE sync-fields trigger
// would clobber an UPDATE back to now(), so we never UPDATE to age it).
// ---------------------------------------------------------------------------

describe('selfHealStaleClimbStats (real DB)', () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    await setupWorkerDatabase();
    client = postgres(getWorkerDatabaseUrl(), { max: 1, onnotice: () => {} });
    db = drizzle(client);
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE TABLE boardsesh_ticks, board_climb_stats, board_climbs, users RESTART IDENTITY CASCADE`,
    );
  });

  async function seedUser(id: string, name: string) {
    await db.execute(sql`
      INSERT INTO users (id, email, name, created_at, updated_at)
      VALUES (${id}, ${`${id}@test.com`}, ${name}, now(), now())
    `);
  }

  async function seedClimb(boardType: string, uuid: string, ownerUserId: string | null) {
    await db.execute(sql`
      INSERT INTO board_climbs (uuid, board_type, layout_id, setter_username, name, description, frames, is_listed, user_id)
      VALUES (${uuid}, ${boardType}, 1, 'setter', 'Test Climb', '', 'p1r1', true, ${ownerUserId})
    `);
  }

  // Insert a stats row with an explicit updated_at so we control staleness. No
  // BEFORE INSERT trigger fires, so the value is preserved verbatim.
  async function seedStats(boardType: string, uuid: string, angle: number, boardseshCount: number, updatedAt: SQL) {
    await db.execute(sql`
      INSERT INTO board_climb_stats
        (board_type, climb_uuid, angle, upstream_ascensionist_count, ascensionist_count, boardsesh_ascensionist_count, updated_at)
      VALUES (${boardType}, ${uuid}, ${angle}, 0, ${boardseshCount}, ${boardseshCount}, ${updatedAt})
    `);
  }

  async function seedTick(opts: {
    userId: string;
    boardType: string;
    climbUuid: string;
    angle: number;
    status: 'flash' | 'send';
    origin: 'native' | 'aurora_pull' | 'kilter_pull' | 'json_import';
    updatedAt: SQL;
  }) {
    await db.execute(sql`
      INSERT INTO boardsesh_ticks
        (uuid, user_id, board_type, climb_uuid, angle, status, origin, attempt_count, climbed_at, created_at, updated_at)
      VALUES (gen_random_uuid()::text, ${opts.userId}, ${opts.boardType}, ${opts.climbUuid}, ${opts.angle},
              ${opts.status}::tick_status, ${opts.origin}::tick_origin, 1, '2026-01-01 00:00:00', now(), ${opts.updatedAt})
    `);
  }

  async function boardseshCount(boardType: string, uuid: string, angle: number): Promise<number> {
    const rows = (await db.execute(sql`
      SELECT boardsesh_ascensionist_count AS bs
        FROM board_climb_stats
       WHERE board_type = ${boardType} AND climb_uuid = ${uuid} AND angle = ${angle}
    `)) as unknown as Array<{ bs: number | string | null }> | { rows: Array<{ bs: number | string | null }> };
    const list = Array.isArray(rows) ? rows : rows.rows;
    return Number(list[0].bs);
  }

  const KEY = { boardType: 'kilter', climbUuid: 'CLIMB-HEAL', angle: 40 };

  it('heals a key whose stats row is stale relative to a recent native send', async () => {
    await seedUser('u-heal', 'Hana');
    await seedClimb(KEY.boardType, KEY.climbUuid, null);
    // Stats row is visibly wrong (boardsesh=0) and stale (updated 30 days ago).
    await seedStats(KEY.boardType, KEY.climbUuid, KEY.angle, 0, sql`now() - interval '30 days'`);
    // A native send updated just now — the recompute that should have bumped the
    // stats row was dropped, so the tick outran it.
    await seedTick({ ...KEY, userId: 'u-heal', status: 'send', origin: 'native', updatedAt: sql`now()` });

    const result = await selfHealStaleClimbStats(db);

    expect(result.keysHealed).toBeGreaterThanOrEqual(1);
    // Re-derived: one native sender → boardsesh_ascensionist_count corrected to 1.
    expect(await boardseshCount(KEY.boardType, KEY.climbUuid, KEY.angle)).toBe(1);
  });

  it('does not select a key whose stats row is already newer than the tick', async () => {
    await seedUser('u-fresh', 'Fred');
    await seedClimb(KEY.boardType, KEY.climbUuid, null);
    // Stats already up to date (boardsesh=1) and stamped now(); the tick is older.
    await seedStats(KEY.boardType, KEY.climbUuid, KEY.angle, 1, sql`now()`);
    await seedTick({
      ...KEY,
      userId: 'u-fresh',
      status: 'send',
      origin: 'native',
      updatedAt: sql`now() - interval '2 minutes'`,
    });

    const result = await selfHealStaleClimbStats(db);

    expect(result.keysHealed).toBe(0);
    // Untouched.
    expect(await boardseshCount(KEY.boardType, KEY.climbUuid, KEY.angle)).toBe(1);
  });

  it('does not select a stale key whose tick is older than the lookback window', async () => {
    await seedUser('u-old', 'Ola');
    await seedClimb(KEY.boardType, KEY.climbUuid, null);
    // Stale stats (boardsesh=0, updated long ago) — but the tick is 2h old.
    await seedStats(KEY.boardType, KEY.climbUuid, KEY.angle, 0, sql`now() - interval '30 days'`);
    await seedTick({
      ...KEY,
      userId: 'u-old',
      status: 'send',
      origin: 'native',
      updatedAt: sql`now() - interval '2 hours'`,
    });

    // 1h lookback: the 2h-old tick falls outside the window, so it is not scanned.
    const result = await selfHealStaleClimbStats(db, { lookbackHours: 1 });

    expect(result.keysHealed).toBe(0);
    // Not healed — still the wrong (stale) value.
    expect(await boardseshCount(KEY.boardType, KEY.climbUuid, KEY.angle)).toBe(0);
  });

  it('recomputeClimbStatsBulk on the healed key matches the self-heal result', async () => {
    // Sanity that self-heal delegates to the same bulk recompute: a direct bulk
    // call on the stale key produces the identical corrected count.
    await seedUser('u-bulk', 'Bea');
    await seedClimb(KEY.boardType, KEY.climbUuid, null);
    await seedStats(KEY.boardType, KEY.climbUuid, KEY.angle, 0, sql`now() - interval '30 days'`);
    await seedTick({ ...KEY, userId: 'u-bulk', status: 'send', origin: 'native', updatedAt: sql`now()` });

    await recomputeClimbStatsBulk(db, [KEY]);

    expect(await boardseshCount(KEY.boardType, KEY.climbUuid, KEY.angle)).toBe(1);
  });
});
