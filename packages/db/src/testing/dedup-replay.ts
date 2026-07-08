/**
 * TEST-ONLY fixture for replaying the PR4 dedup migration lineage
 * (0164 kilter_detached_at, 0165 kilter dedup, 0166 aurora/json dedup) against
 * a scratch Postgres. Never import from production code.
 *
 * Shared by two harnesses so the replay runs BOTH in CI and locally:
 *  - packages/backend/src/__tests__/dedup-migration-replay.test.ts (vitest,
 *    backend project) — runs on every CI backend job against the auto-started
 *    docker postgres; creates its own throwaway database per vitest worker.
 *  - packages/db/src/queries/climb-stats/__tests__/
 *    dedup-migration-replay.integration.test.ts (node:test) — opt-in local
 *    scratch mode via MIGRATION_REPLAY_DB_URL.
 *
 * The checks use node:assert/strict, which works identically under node:test
 * and vitest.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';

/** packages/db/drizzle, resolved from this file's location. */
export const DEDUP_REPLAY_DRIZZLE_DIR = path.resolve(import.meta.dirname, '../../drizzle');

export const DEDUP_REPLAY_MIGRATION_TAGS = [
  '0164_kilter_detached_at',
  '0165_kilter_dedup_backfill',
  '0166_aurora_json_dedup_backfill',
] as const;

export function dedupReplayMigrationSql(tag: (typeof DEDUP_REPLAY_MIGRATION_TAGS)[number]): string {
  return readFileSync(path.join(DEDUP_REPLAY_DRIZZLE_DIR, `${tag}.sql`), 'utf-8');
}

/**
 * MINIMAL synthetic schema — only the tables the dedup touches, and
 * boardsesh_ticks deliberately WITHOUT kilter_detached_at so migration 0164
 * exercises the ADD COLUMN.
 */
export const DEDUP_REPLAY_SCHEMA_SQL = `
  CREATE TYPE tick_status AS ENUM ('flash','send','attempt');
  CREATE TYPE tick_origin AS ENUM ('native','aurora_pull','kilter_pull','json_import');
  CREATE TYPE aurora_table_type AS ENUM ('ascents','bids');
  CREATE TYPE kilter_table_type AS ENUM ('logs','attempts');

  CREATE TABLE users (id text PRIMARY KEY, name text);
  CREATE TABLE user_profiles (user_id text PRIMARY KEY, display_name text);
  CREATE TABLE board_climbs (board_type text, uuid text, user_id text, PRIMARY KEY (board_type, uuid));

  CREATE TABLE board_climb_stats (
    board_type text NOT NULL,
    climb_uuid text NOT NULL,
    angle integer NOT NULL,
    ascensionist_count integer DEFAULT 0,
    upstream_ascensionist_count integer DEFAULT 0,
    boardsesh_ascensionist_count integer DEFAULT 0,
    fa_username text,
    fa_at timestamp,
    quality_average double precision,
    quality_normalized boolean,
    difficulty_average double precision,
    display_difficulty double precision,
    PRIMARY KEY (board_type, climb_uuid, angle)
  );

  -- boardsesh_ticks WITHOUT kilter_detached_at (migration 0164 adds it).
  CREATE TABLE boardsesh_ticks (
    id bigserial PRIMARY KEY,
    uuid text NOT NULL UNIQUE,
    user_id text NOT NULL,
    board_type text NOT NULL,
    climb_uuid text NOT NULL,
    angle integer NOT NULL,
    is_mirror boolean DEFAULT false,
    origin tick_origin NOT NULL DEFAULT 'native',
    status tick_status NOT NULL,
    attempt_count integer NOT NULL DEFAULT 1,
    quality integer,
    difficulty integer,
    is_benchmark boolean DEFAULT false,
    comment text DEFAULT '',
    climbed_at timestamp NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL,
    aurora_type aurora_table_type,
    aurora_id text UNIQUE,
    aurora_synced_at timestamp,
    aurora_sync_error text,
    kilter_type kilter_table_type,
    kilter_id text UNIQUE,
    kilter_synced_at timestamp,
    kilter_sync_error text
  );
`;

/** Seed: user + owned catalog climb + a stats row per key, plus every case. */
export const DEDUP_REPLAY_SEED_SQL = `
  INSERT INTO users (id, name) VALUES
    ('u1','Ana'),('u2','Bob'),('u3','Cid'),('u4','Dee'),('u5','Eve'),('u6','Fay');
  INSERT INTO board_climbs (board_type, uuid, user_id) VALUES
    ('kilter','c1',NULL),('kilter','c2',NULL),('kilter','c3',NULL),('kilter','c5',NULL),('kilter','c6',NULL);
  INSERT INTO board_climb_stats (board_type, climb_uuid, angle, upstream_ascensionist_count) VALUES
    ('kilter','c1',40,100),('kilter','c2',40,100),('kilter','c3',40,100),('kilter','c5',40,100),('kilter','c6',40,100);

  -- CASE 1: clean kilter pair (json_import original +10h vs kilter_pull twin).
  INSERT INTO boardsesh_ticks (uuid,user_id,board_type,climb_uuid,angle,origin,status,climbed_at,created_at,aurora_id,kilter_id,kilter_type,kilter_synced_at) VALUES
    ('t1-orig','u1','kilter','c1',40,'json_import','send','2026-05-01 22:00:00','2026-05-01 22:00:00','json-import-1',NULL,NULL,NULL),
    ('t1-twin','u1','kilter','c1',40,'kilter_pull','send','2026-05-01 12:00:00','2026-06-01 00:00:00',NULL,'klog-1','logs','2026-06-01 00:00:00');

  -- CASE 2: ambiguous trio (twin + TWO originals both at a valid offset) → left alone.
  INSERT INTO boardsesh_ticks (uuid,user_id,board_type,climb_uuid,angle,origin,status,climbed_at,created_at,kilter_id,kilter_type,kilter_synced_at) VALUES
    ('t2-twin','u2','kilter','c2',40,'kilter_pull','send','2026-05-01 12:00:00','2026-06-01 00:00:00','klog-2','logs','2026-06-01 00:00:00');
  INSERT INTO boardsesh_ticks (uuid,user_id,board_type,climb_uuid,angle,origin,status,climbed_at,created_at,aurora_id) VALUES
    ('t2-orig-a','u2','kilter','c2',40,'json_import','send','2026-05-01 22:00:00','2026-05-01 22:00:00','json-import-2a'),
    ('t2-orig-b','u2','kilter','c2',40,'native','send','2026-05-01 22:30:00','2026-05-01 22:30:00',NULL);

  -- CASE 3: cross-user near-match — original belongs to a DIFFERENT user → never merged.
  INSERT INTO boardsesh_ticks (uuid,user_id,board_type,climb_uuid,angle,origin,status,climbed_at,created_at,kilter_id,kilter_type,kilter_synced_at) VALUES
    ('t3-twin','u3','kilter','c3',40,'kilter_pull','send','2026-05-01 12:00:00','2026-06-01 00:00:00','klog-3','logs','2026-06-01 00:00:00');
  INSERT INTO boardsesh_ticks (uuid,user_id,board_type,climb_uuid,angle,origin,status,climbed_at,created_at,aurora_id) VALUES
    ('t3-other','u4','kilter','c3',40,'json_import','send','2026-05-01 22:00:00','2026-05-01 22:00:00','json-import-3');

  -- CASE 4: clean aurora/json pair (json_import original + aurora_pull real-uuid twin, exact time).
  INSERT INTO boardsesh_ticks (uuid,user_id,board_type,climb_uuid,angle,origin,status,climbed_at,created_at,aurora_id,aurora_type,aurora_synced_at) VALUES
    ('t4-orig','u5','kilter','c5',40,'json_import','send','2026-05-01 12:00:00','2026-05-01 12:00:00','json-import-5',NULL,NULL),
    ('t4-twin','u5','kilter','c5',40,'aurora_pull','send','2026-05-01 12:00:00','2026-06-01 00:00:00','real-aurora-5','ascents','2026-06-01 00:00:00');

  -- CASE 5: CHAINED — a native original collects a kilter twin (0165) AND an aurora
  -- twin (0166) onto the SAME row. Times are picked so 0165 sees ONLY the original
  -- as the kilter twin's candidate: original 12:00, kilter twin 02:00 (−10h, valid),
  -- aurora twin 20:00 (+8h vs original, valid). The aurora↔kilter gap is 18h (>14h),
  -- so the aurora row is NOT a candidate for the kilter twin — 0165 cleanly stamps
  -- klog-6 onto the original. Then 0166 must fold the aurora twin onto that same
  -- (now kilter-linked) original: the old kilter_id-IS-NULL guard skipped it.
  INSERT INTO boardsesh_ticks (uuid,user_id,board_type,climb_uuid,angle,origin,status,climbed_at,created_at,aurora_id,aurora_type,aurora_synced_at,kilter_id,kilter_type,kilter_synced_at) VALUES
    ('t5-orig','u6','kilter','c6',40,'native','send','2026-05-01 12:00:00','2026-05-01 12:00:00',NULL,NULL,NULL,NULL,NULL,NULL),
    ('t5-ktwin','u6','kilter','c6',40,'kilter_pull','send','2026-05-01 02:00:00','2026-06-01 00:00:00',NULL,NULL,NULL,'klog-6','logs','2026-06-01 00:00:00'),
    ('t5-atwin','u6','kilter','c6',40,'aurora_pull','send','2026-05-01 20:00:00','2026-06-01 00:00:00','real-aurora-6','ascents','2026-06-01 00:00:00',NULL,NULL,NULL);
`;

/** Build the synthetic schema, seed every case, and apply 0164→0166 verbatim. */
export async function prepareDedupReplayDatabase(db: postgres.Sql): Promise<void> {
  await db.unsafe(DEDUP_REPLAY_SCHEMA_SQL);
  await db.unsafe(DEDUP_REPLAY_SEED_SQL);
  for (const tag of DEDUP_REPLAY_MIGRATION_TAGS) {
    await db.unsafe(dedupReplayMigrationSql(tag));
  }
}

export type DedupReplayCheck = {
  name: string;
  run: (db: postgres.Sql) => Promise<void>;
};

/**
 * The replay assertions, framework-agnostic (throw on failure). Both harnesses
 * map each entry to an `it(name, () => run(db))`.
 */
export const dedupReplayChecks: DedupReplayCheck[] = [
  {
    name: '0164 added kilter_detached_at',
    run: async (db) => {
      const rows = await db`SELECT column_name FROM information_schema.columns
        WHERE table_name='boardsesh_ticks' AND column_name='kilter_detached_at'`;
      assert.equal(rows.length, 1);
    },
  },
  {
    name: 'CASE 1: merges the clean kilter pair — twin deleted, surrogate moved onto the original',
    run: async (db) => {
      const twin = await db`SELECT * FROM boardsesh_ticks WHERE uuid='t1-twin'`;
      assert.equal(twin.length, 0, 'kilter_pull twin should be deleted');
      const orig = await db`SELECT kilter_id, kilter_type, origin FROM boardsesh_ticks WHERE uuid='t1-orig'`;
      assert.equal(orig.length, 1, 'original survives');
      assert.equal(orig[0].kilter_id, 'klog-1', 'kilter_id moved onto the original');
      assert.equal(orig[0].kilter_type, 'logs');
      assert.equal(orig[0].origin, 'json_import', 'origin preserved (records first creation)');
    },
  },
  {
    name: 'CASE 2: leaves the ambiguous trio completely untouched',
    run: async (db) => {
      const twin = await db`SELECT kilter_id FROM boardsesh_ticks WHERE uuid='t2-twin'`;
      assert.equal(twin.length, 1, 'ambiguous twin NOT deleted');
      assert.equal(twin[0].kilter_id, 'klog-2', 'twin keeps its own kilter_id');
      const origs = await db`SELECT kilter_id FROM boardsesh_ticks WHERE uuid IN ('t2-orig-a','t2-orig-b')`;
      assert.equal(origs.length, 2);
      assert.ok(
        origs.every((r) => r.kilter_id === null),
        'neither original was stamped',
      );
    },
  },
  {
    name: 'CASE 3: never merges across users',
    run: async (db) => {
      const twin = await db`SELECT kilter_id FROM boardsesh_ticks WHERE uuid='t3-twin'`;
      assert.equal(twin.length, 1);
      assert.equal(twin[0].kilter_id, 'klog-3', 'cross-user twin untouched');
      const other = await db`SELECT kilter_id FROM boardsesh_ticks WHERE uuid='t3-other'`;
      assert.equal(other[0].kilter_id, null, "other user's row untouched");
    },
  },
  {
    name: 'CASE 4: merges the clean aurora/json pair — twin deleted, real aurora_id moved onto the original',
    run: async (db) => {
      const twin = await db`SELECT * FROM boardsesh_ticks WHERE uuid='t4-twin'`;
      assert.equal(twin.length, 0, 'aurora_pull twin should be deleted');
      const orig = await db`SELECT aurora_id, aurora_type, origin FROM boardsesh_ticks WHERE uuid='t4-orig'`;
      assert.equal(orig[0].aurora_id, 'real-aurora-5', 'real aurora_id replaced the json-import synthetic');
      assert.equal(orig[0].aurora_type, 'ascents');
      assert.equal(orig[0].origin, 'json_import');
    },
  },
  {
    name: 'CASE 5: chained kilter (0165) + aurora (0166) fold onto the SAME original',
    run: async (db) => {
      const kilterTwin = await db`SELECT id FROM boardsesh_ticks WHERE uuid='t5-ktwin'`;
      assert.equal(kilterTwin.length, 0, 'kilter twin deleted by 0165');
      const auroraTwin = await db`SELECT id FROM boardsesh_ticks WHERE uuid='t5-atwin'`;
      assert.equal(auroraTwin.length, 0, 'aurora twin deleted by 0166');

      const orig = await db`SELECT kilter_id, kilter_type, aurora_id, aurora_type, origin
        FROM boardsesh_ticks WHERE uuid='t5-orig'`;
      assert.equal(orig.length, 1, 'original survives both merges');
      assert.equal(orig[0].kilter_id, 'klog-6', '0165 kilter surrogate survives through 0166 (COALESCE keeps it)');
      assert.equal(orig[0].kilter_type, 'logs');
      assert.equal(orig[0].aurora_id, 'real-aurora-6', '0166 moved the real aurora surrogate onto the same original');
      assert.equal(orig[0].aurora_type, 'ascents');
      assert.equal(orig[0].origin, 'native', 'origin preserved (records first creation)');
    },
  },
  {
    name: 'CASE 5: stats key recomputed after the chained merge',
    run: async (db) => {
      const stats = await db`SELECT boardsesh_ascensionist_count, ascensionist_count
        FROM board_climb_stats WHERE board_type='kilter' AND climb_uuid='c6' AND angle=40`;
      assert.equal(stats.length, 1);
      assert.equal(
        stats[0].boardsesh_ascensionist_count,
        1,
        'exactly one distinct boardsesh sender remains after dedup',
      );
      assert.equal(stats[0].ascensionist_count, 101, 'seeded upstream 100 + 1 boardsesh sender');
    },
  },
  {
    name: 'records both dedup guard rows (idempotent re-application is a no-op)',
    run: async (db) => {
      const guards = await db`SELECT tag FROM _bs_migration_guards ORDER BY tag`;
      const tags = guards.map((r) => r.tag);
      assert.ok(tags.includes('0165_kilter_dedup_backfill'));
      assert.ok(tags.includes('0166_aurora_json_dedup_backfill'));
      // Re-applying is a no-op (guard short-circuits) and doesn't throw.
      await db.unsafe(dedupReplayMigrationSql('0165_kilter_dedup_backfill'));
      await db.unsafe(dedupReplayMigrationSql('0166_aurora_json_dedup_backfill'));
      const still = await db`SELECT count(*)::int AS n FROM boardsesh_ticks WHERE uuid='t1-orig'`;
      assert.equal(still[0].n, 1);
    },
  },
];
