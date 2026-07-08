import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { boardClimbStats } from '@boardsesh/db/schema';
import { blendedQualityAverageSql } from '@boardsesh/db/queries';
import { getWorkerDatabaseUrl, setupWorkerDatabase } from './worker-db';

// ---------------------------------------------------------------------------
// Quality-blend backfill migrations (0168 init + 0169 blend) replayed against a
// real Postgres (the backend worker DB), plus the shared ON CONFLICT blend
// idiom the three upstream writers use. Covers every branch of the blend and
// proves the 0168 guard makes a double-apply safe.
// ---------------------------------------------------------------------------

const drizzleDir = fileURLToPath(new URL('../../../db/drizzle/', import.meta.url));
const MIGRATION_0168 = readFileSync(`${drizzleDir}0168_init_upstream_quality_average.sql`, 'utf8');
const MIGRATION_0169 = readFileSync(`${drizzleDir}0169_backfill_quality_blend.sql`, 'utf8');

describe('quality-blend backfill (0168 + 0169) — real DB replay', () => {
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
    // Fresh guard slate so each replay starts un-applied (0168 recreates it).
    await db.execute(sql`DROP TABLE IF EXISTS _bs_migration_guards`);
  });

  async function seedUser(id: string) {
    await db.execute(sql`INSERT INTO users (id, email, name, created_at, updated_at)
      VALUES (${id}, ${`${id}@t.com`}, ${id}, now(), now())`);
  }

  async function seedClimb(uuid: string, ownerUserId: string | null) {
    await db.execute(sql`INSERT INTO board_climbs (uuid, board_type, layout_id, setter_username, name, description, frames, is_listed, user_id)
      VALUES (${uuid}, 'kilter', 1, 's', 'c', '', 'p1r1', true, ${ownerUserId})`);
  }

  async function seedStats(uuid: string, opts: { upstream: number; qualityAverage: number | null }) {
    // Pre-migration shape: quality_average holds the raw upstream value (or NULL);
    // upstream_quality_average / boardsesh_* are all NULL (0167 just added them).
    await db.execute(sql`INSERT INTO board_climb_stats
      (board_type, climb_uuid, angle, upstream_ascensionist_count, ascensionist_count, boardsesh_ascensionist_count, quality_average, quality_normalized)
      VALUES ('kilter', ${uuid}, 40, ${opts.upstream}, ${opts.upstream}, 0, ${opts.qualityAverage}, true)`);
  }

  async function seedTick(t: {
    userId: string;
    climbUuid: string;
    status: 'flash' | 'send' | 'attempt';
    origin: 'native' | 'aurora_pull' | 'kilter_pull' | 'json_import';
    quality: number | null;
    climbedAt: string;
  }) {
    await db.execute(sql`INSERT INTO boardsesh_ticks
      (uuid, user_id, board_type, climb_uuid, angle, status, origin, attempt_count, quality, climbed_at, created_at, updated_at)
      VALUES (gen_random_uuid()::text, ${t.userId}, 'kilter', ${t.climbUuid}, 40, ${t.status}::tick_status, ${t.origin}::tick_origin, 1, ${t.quality}, ${t.climbedAt}, now(), now())`);
  }

  async function row(uuid: string) {
    const rows = (await db.execute(sql`
      SELECT quality_average AS q, upstream_quality_average AS uq,
             boardsesh_quality_sum AS bs, boardsesh_quality_count AS bc
        FROM board_climb_stats WHERE board_type='kilter' AND climb_uuid=${uuid} AND angle=40
    `)) as unknown as Array<{
      q: number | string | null;
      uq: number | string | null;
      bs: number | string | null;
      bc: number | string | null;
    }>;
    const list = Array.isArray(rows) ? rows : (rows as { rows: typeof rows }).rows;
    return list[0];
  }

  const num = (v: number | string | null) => (v == null ? null : Number(v));

  async function applyMigrations() {
    await client.unsafe(MIGRATION_0168);
    await client.unsafe(MIGRATION_0169);
  }

  // One fixture that lights up every branch of both migrations.
  async function seedEveryBranch() {
    await seedUser('u1');
    await seedUser('u2');

    // K1 — non-owned, upstream-rated, one native rated send → blended.
    await seedClimb('K1', null);
    await seedStats('K1', { upstream: 10, qualityAverage: 4 });
    await seedTick({
      userId: 'u1',
      climbUuid: 'K1',
      status: 'send',
      origin: 'native',
      quality: 2,
      climbedAt: '2026-01-01 00:00:00',
    });

    // K2 — non-owned, upstream-rated, only an IMPORTED rated tick → NOT a 0169
    // key; quality_average stays the pure upstream value, no Boardsesh terms.
    await seedClimb('K2', null);
    await seedStats('K2', { upstream: 10, qualityAverage: 4 });
    await seedTick({
      userId: 'u1',
      climbUuid: 'K2',
      status: 'send',
      origin: 'json_import',
      quality: 1,
      climbedAt: '2026-01-01 00:00:00',
    });

    // K3 — OWNED, two native rated sends → plain AVG, never a blend. Seed a
    // STALE quality_average to prove 0169 recomputes the owned average.
    await seedClimb('K3', 'u1');
    await seedStats('K3', { upstream: 0, qualityAverage: 1 });
    await seedTick({
      userId: 'u1',
      climbUuid: 'K3',
      status: 'send',
      origin: 'native',
      quality: 2,
      climbedAt: '2026-01-01 00:00:00',
    });
    await seedTick({
      userId: 'u2',
      climbUuid: 'K3',
      status: 'send',
      origin: 'native',
      quality: 4,
      climbedAt: '2026-01-02 00:00:00',
    });

    // K4 — non-owned, manufacturer NEVER rated (quality_average NULL), two
    // native rated sends → pure Boardsesh average, upstream term drops out.
    await seedClimb('K4', null);
    await seedStats('K4', { upstream: 50, qualityAverage: null });
    await seedTick({
      userId: 'u1',
      climbUuid: 'K4',
      status: 'flash',
      origin: 'native',
      quality: 3,
      climbedAt: '2026-01-01 00:00:00',
    });
    await seedTick({
      userId: 'u2',
      climbUuid: 'K4',
      status: 'send',
      origin: 'native',
      quality: 5,
      climbedAt: '2026-01-02 00:00:00',
    });

    // K5 — non-owned, ONE climber re-ticks (2 then 5) → only the latest rating
    // votes; blended against upstream.
    await seedClimb('K5', null);
    await seedStats('K5', { upstream: 5, qualityAverage: 3 });
    await seedTick({
      userId: 'u1',
      climbUuid: 'K5',
      status: 'send',
      origin: 'native',
      quality: 2,
      climbedAt: '2026-01-01 00:00:00',
    });
    await seedTick({
      userId: 'u1',
      climbUuid: 'K5',
      status: 'send',
      origin: 'native',
      quality: 5,
      climbedAt: '2026-06-01 00:00:00',
    });

    // K6 — non-owned, upstream-rated, NO ticks → 0168 seeds upstream_quality_average,
    // 0169 leaves it untouched (not a native-rated key).
    await seedClimb('K6', null);
    await seedStats('K6', { upstream: 8, qualityAverage: 4.5 });
  }

  it('produces the correct blend for every branch after 0168 + 0169', async () => {
    await seedEveryBranch();
    await applyMigrations();

    // K1 blended: (4*10 + 2)/(10 + 1) = 42/11.
    const k1 = await row('K1');
    expect(num(k1.q)).toBeCloseTo(42 / 11, 6);
    expect(num(k1.uq)).toBe(4);
    expect(num(k1.bs)).toBe(2);
    expect(num(k1.bc)).toBe(1);

    // K2 imported-only: upstream seeded, quality untouched, no Boardsesh terms.
    const k2 = await row('K2');
    expect(num(k2.q)).toBeCloseTo(4, 6);
    expect(num(k2.uq)).toBe(4);
    expect(k2.bs).toBe(null);
    expect(k2.bc).toBe(null);

    // K3 owned: plain AVG(2,4)=3 (stale 1 corrected), upstream stays NULL, and
    // the blend-input columns are NULL — owned climbs are never blended.
    const k3 = await row('K3');
    expect(num(k3.q)).toBeCloseTo(3, 6);
    expect(k3.uq).toBe(null);
    expect(k3.bs).toBe(null);
    expect(k3.bc).toBe(null);

    // K4 manufacturer-unrated: pure Boardsesh (3+5)/2 = 4, upstream stays NULL.
    const k4 = await row('K4');
    expect(num(k4.q)).toBeCloseTo(4, 6);
    expect(k4.uq).toBe(null);
    expect(num(k4.bs)).toBe(8);
    expect(num(k4.bc)).toBe(2);

    // K5 re-tick: latest rating 5 only → (3*5 + 5)/(5 + 1) = 20/6.
    const k5 = await row('K5');
    expect(num(k5.q)).toBeCloseTo(20 / 6, 6);
    expect(num(k5.bs)).toBe(5);
    expect(num(k5.bc)).toBe(1);

    // K6 no ticks: upstream seeded, quality unchanged, no Boardsesh terms.
    const k6 = await row('K6');
    expect(num(k6.q)).toBeCloseTo(4.5, 6);
    expect(num(k6.uq)).toBe(4.5);
    expect(k6.bs).toBe(null);
    expect(k6.bc).toBe(null);
  });

  it('is double-apply safe — the 0168 guard prevents re-seeding a blended value', async () => {
    await seedEveryBranch();
    await applyMigrations();

    const before = {
      k1: await row('K1'),
      k4: await row('K4'),
      k6: await row('K6'),
    };

    // Re-run BOTH migrations. Without the guard, 0168 would copy K1's now-blended
    // quality_average (42/11) back into upstream_quality_average, corrupting it.
    await applyMigrations();

    const k1 = await row('K1');
    // upstream_quality_average is STILL the raw 4, not the blended 42/11.
    expect(num(k1.uq)).toBe(4);
    expect(num(k1.q)).toBeCloseTo(num(before.k1.q)!, 9);
    // Everything else is a fixpoint too.
    expect(num((await row('K4')).q)).toBeCloseTo(num(before.k4.q)!, 9);
    expect(num((await row('K6')).uq)).toBe(num(before.k6.uq));

    // The guard row exists exactly once.
    const guard = (await db.execute(
      sql`SELECT count(*)::int AS n FROM _bs_migration_guards WHERE tag='0168_init_upstream_quality_average'`,
    )) as unknown as Array<{
      n: number;
    }>;
    const guardRows = Array.isArray(guard) ? guard : (guard as { rows: typeof guard }).rows;
    expect(Number(guardRows[0].n)).toBe(1);
  });

  // -------------------------------------------------------------------------
  // The ON CONFLICT blend idiom shared by the three upstream writers
  // (aurora shared-sync upsertClimbStats, kilter catalog-sync, kilter
  // stats-repair): an upstream snapshot lands its quality in
  // upstream_quality_average and re-blends quality_average using the NEW
  // GREATEST(stored, incoming) ascent count as the weight and the STORED
  // Boardsesh terms. This proves the weight is the post-GREATEST count, not the
  // stale stored one (a Postgres SET reads the OLD value of a bare column).
  // -------------------------------------------------------------------------
  it('upstream writer upsert re-blends against the NEW (GREATEST) ascent count', async () => {
    await seedClimb('W1', null);
    // Existing row: upstream q=3 over 10 ascents, plus one Boardsesh vote (5).
    await db.execute(sql`INSERT INTO board_climb_stats
      (board_type, climb_uuid, angle, upstream_ascensionist_count, ascensionist_count, boardsesh_ascensionist_count,
       upstream_quality_average, quality_average, boardsesh_quality_sum, boardsesh_quality_count, quality_normalized)
      VALUES ('kilter', 'W1', 40, 10, 11, 1, 3, ${(3 * 10 + 5) / (10 + 1)}, 5, 1, true)`);

    // Incoming upstream snapshot: quality 4, ascent count raised to 20.
    const blend = blendedQualityAverageSql({
      upstreamQualityAverage: sql`excluded.upstream_quality_average`,
      upstreamAscensionistCount: sql`GREATEST(COALESCE(${boardClimbStats.upstreamAscensionistCount}, 0), COALESCE(excluded.upstream_ascensionist_count, 0))`,
      boardseshQualitySum: sql`${boardClimbStats.boardseshQualitySum}`,
      boardseshQualityCount: sql`${boardClimbStats.boardseshQualityCount}`,
    });
    await db
      .insert(boardClimbStats)
      .values({
        boardType: 'kilter',
        climbUuid: 'W1',
        angle: 40,
        upstreamAscensionistCount: 20,
        ascensionistCount: 20,
        boardseshAscensionistCount: 0,
        upstreamQualityAverage: 4,
        qualityAverage: 4,
        qualityNormalized: true,
      })
      .onConflictDoUpdate({
        target: [boardClimbStats.boardType, boardClimbStats.climbUuid, boardClimbStats.angle],
        set: {
          upstreamAscensionistCount: sql`GREATEST(COALESCE(${boardClimbStats.upstreamAscensionistCount}, 0), COALESCE(excluded.upstream_ascensionist_count, 0))`,
          upstreamQualityAverage: sql`excluded.upstream_quality_average`,
          qualityAverage: blend,
        },
      });

    const w1 = await row('W1');
    // Weight is the NEW count 20: (4*20 + 5)/(20 + 1) = 85/21 ≈ 4.048.
    // The stale-count bug would give (4*10 + 5)/(10 + 1) = 45/11 ≈ 4.09.
    expect(num(w1.q)).toBeCloseTo(85 / 21, 6);
    expect(num(w1.q)).not.toBeCloseTo(45 / 11, 3);
    expect(num(w1.uq)).toBe(4);
  });

  // A manufacturer-rated climb with zero ascent weight and no Boardsesh votes
  // must NOT have its quality cleared to NULL by the blend (0/0). The outer
  // COALESCE falls back to the raw upstream average. Guards the regression a
  // future live catalog-sync pass would otherwise cause.
  it('preserves upstream quality when the ascent-count weight is 0 and there are no votes', async () => {
    await seedClimb('Z1', null);
    await db.execute(sql`INSERT INTO board_climb_stats
      (board_type, climb_uuid, angle, upstream_ascensionist_count, ascensionist_count, boardsesh_ascensionist_count,
       upstream_quality_average, quality_average, quality_normalized)
      VALUES ('kilter', 'Z1', 40, 0, 0, 0, 3.5, 3.5, true)`);

    const blend = blendedQualityAverageSql({
      upstreamQualityAverage: sql`excluded.upstream_quality_average`,
      upstreamAscensionistCount: sql`GREATEST(COALESCE(${boardClimbStats.upstreamAscensionistCount}, 0), COALESCE(excluded.upstream_ascensionist_count, 0))`,
      boardseshQualitySum: sql`${boardClimbStats.boardseshQualitySum}`,
      boardseshQualityCount: sql`${boardClimbStats.boardseshQualityCount}`,
    });
    await db
      .insert(boardClimbStats)
      .values({
        boardType: 'kilter',
        climbUuid: 'Z1',
        angle: 40,
        upstreamAscensionistCount: 0,
        ascensionistCount: 0,
        boardseshAscensionistCount: 0,
        upstreamQualityAverage: 3.5,
        qualityAverage: 3.5,
        qualityNormalized: true,
      })
      .onConflictDoUpdate({
        target: [boardClimbStats.boardType, boardClimbStats.climbUuid, boardClimbStats.angle],
        set: {
          upstreamAscensionistCount: sql`GREATEST(COALESCE(${boardClimbStats.upstreamAscensionistCount}, 0), COALESCE(excluded.upstream_ascensionist_count, 0))`,
          upstreamQualityAverage: sql`excluded.upstream_quality_average`,
          qualityAverage: blend,
        },
      });

    const z1 = await row('Z1');
    expect(num(z1.q)).toBe(3.5); // fallback, not NULL
    expect(num(z1.uq)).toBe(3.5);
  });
});
