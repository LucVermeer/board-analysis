import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

/**
 * Scratch-Postgres replay of the PR4 dedup lineage (0163 add column, 0164 kilter
 * dedup, 0165 aurora/json dedup). Opt-in: set MIGRATION_REPLAY_DB_URL to a
 * throwaway superuser Postgres (a plain `docker run postgres`), e.g.
 *
 *   cd packages/db && MIGRATION_REPLAY_DB_URL=postgres://postgres:postgres@localhost:5433/postgres \
 *     bun run test  (or: bunx tsx --test src/queries/climb-stats/__tests__/dedup-migration-replay.integration.test.ts)
 *
 * The test creates a throwaway database, builds a MINIMAL schema (only the
 * tables the dedup touches, boardsesh_ticks deliberately WITHOUT
 * kilter_detached_at so migration 0163 exercises the ADD COLUMN), seeds every
 * case, applies the three migration SQL files verbatim, and asserts the outcome:
 * a clean 1:1 pair merges, an ambiguous group is left alone, and a cross-user
 * near-match is never merged.
 */

const REPLAY_URL = process.env.MIGRATION_REPLAY_DB_URL;
const DRIZZLE_DIR = path.resolve(import.meta.dirname, '../../../../drizzle');
const DB_NAME = 'bs_pr4_dedup_replay';

function migrationSql(tag: string): string {
  return readFileSync(path.join(DRIZZLE_DIR, `${tag}.sql`), 'utf-8');
}

const SCHEMA_SQL = `
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

  -- boardsesh_ticks WITHOUT kilter_detached_at (migration 0163 adds it).
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

// Seed: user + owned catalog climb + a stats row per key.
const SEED_SQL = `
  INSERT INTO users (id, name) VALUES
    ('u1','Ana'),('u2','Bob'),('u3','Cid'),('u4','Dee'),('u5','Eve');
  INSERT INTO board_climbs (board_type, uuid, user_id) VALUES
    ('kilter','c1',NULL),('kilter','c2',NULL),('kilter','c3',NULL),('kilter','c5',NULL);
  INSERT INTO board_climb_stats (board_type, climb_uuid, angle, upstream_ascensionist_count) VALUES
    ('kilter','c1',40,100),('kilter','c2',40,100),('kilter','c3',40,100),('kilter','c5',40,100);

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
`;

const suite = REPLAY_URL ? describe : describe.skip;

suite('PR4 dedup migration replay (0163→0165)', () => {
  let admin: postgres.Sql;
  let db: postgres.Sql;

  before(async () => {
    admin = postgres(REPLAY_URL as string, { max: 1, onnotice: () => {} });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
    const dbUrl = new URL(REPLAY_URL as string);
    dbUrl.pathname = `/${DB_NAME}`;
    db = postgres(dbUrl.toString(), { max: 1, onnotice: () => {} });

    await db.unsafe(SCHEMA_SQL);
    await db.unsafe(SEED_SQL);
    // Apply the migration lineage in order, verbatim.
    await db.unsafe(migrationSql('0163_kilter_detached_at'));
    await db.unsafe(migrationSql('0164_kilter_dedup_backfill'));
    await db.unsafe(migrationSql('0165_aurora_json_dedup_backfill'));
  });

  after(async () => {
    if (db) await db.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
      await admin.end();
    }
  });

  it('0163 added kilter_detached_at', async () => {
    const rows = await db`SELECT column_name FROM information_schema.columns
      WHERE table_name='boardsesh_ticks' AND column_name='kilter_detached_at'`;
    assert.equal(rows.length, 1);
  });

  it('CASE 1: merges the clean kilter pair — twin deleted, surrogate moved onto the original', async () => {
    const twin = await db`SELECT * FROM boardsesh_ticks WHERE uuid='t1-twin'`;
    assert.equal(twin.length, 0, 'kilter_pull twin should be deleted');
    const orig = await db`SELECT kilter_id, kilter_type, origin FROM boardsesh_ticks WHERE uuid='t1-orig'`;
    assert.equal(orig.length, 1, 'original survives');
    assert.equal(orig[0].kilter_id, 'klog-1', 'kilter_id moved onto the original');
    assert.equal(orig[0].kilter_type, 'logs');
    assert.equal(orig[0].origin, 'json_import', 'origin preserved (records first creation)');
  });

  it('CASE 2: leaves the ambiguous trio completely untouched', async () => {
    const twin = await db`SELECT kilter_id FROM boardsesh_ticks WHERE uuid='t2-twin'`;
    assert.equal(twin.length, 1, 'ambiguous twin NOT deleted');
    assert.equal(twin[0].kilter_id, 'klog-2', 'twin keeps its own kilter_id');
    const origs = await db`SELECT kilter_id FROM boardsesh_ticks WHERE uuid IN ('t2-orig-a','t2-orig-b')`;
    assert.equal(origs.length, 2);
    assert.ok(
      origs.every((r) => r.kilter_id === null),
      'neither original was stamped',
    );
  });

  it('CASE 3: never merges across users', async () => {
    const twin = await db`SELECT kilter_id FROM boardsesh_ticks WHERE uuid='t3-twin'`;
    assert.equal(twin.length, 1);
    assert.equal(twin[0].kilter_id, 'klog-3', 'cross-user twin untouched');
    const other = await db`SELECT kilter_id FROM boardsesh_ticks WHERE uuid='t3-other'`;
    assert.equal(other[0].kilter_id, null, "other user's row untouched");
  });

  it('CASE 4: merges the clean aurora/json pair — twin deleted, real aurora_id moved onto the original', async () => {
    const twin = await db`SELECT * FROM boardsesh_ticks WHERE uuid='t4-twin'`;
    assert.equal(twin.length, 0, 'aurora_pull twin should be deleted');
    const orig = await db`SELECT aurora_id, aurora_type, origin FROM boardsesh_ticks WHERE uuid='t4-orig'`;
    assert.equal(orig[0].aurora_id, 'real-aurora-5', 'real aurora_id replaced the json-import synthetic');
    assert.equal(orig[0].aurora_type, 'ascents');
    assert.equal(orig[0].origin, 'json_import');
  });

  it('records both dedup guard rows (idempotent re-application is a no-op)', async () => {
    const guards = await db`SELECT tag FROM _bs_migration_guards ORDER BY tag`;
    const tags = guards.map((r) => r.tag);
    assert.ok(tags.includes('0164_kilter_dedup_backfill'));
    assert.ok(tags.includes('0165_aurora_json_dedup_backfill'));
    // Re-applying is a no-op (guard short-circuits) and doesn't throw.
    await db.unsafe(migrationSql('0164_kilter_dedup_backfill'));
    await db.unsafe(migrationSql('0165_aurora_json_dedup_backfill'));
    const still = await db`SELECT count(*)::int AS n FROM boardsesh_ticks WHERE uuid='t1-orig'`;
    assert.equal(still[0].n, 1);
  });
});
