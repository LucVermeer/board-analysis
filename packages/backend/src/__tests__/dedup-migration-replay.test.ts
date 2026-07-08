import { afterAll, beforeAll, describe, it } from 'vite-plus/test';
import postgres from 'postgres';

import { prepareDedupReplayDatabase, dedupReplayChecks } from '@boardsesh/db/testing/dedup-replay';

/**
 * CI replay of the PR4 dedup migration lineage (0163 kilter_detached_at,
 * 0164 kilter dedup, 0165 aurora/json dedup).
 *
 * Runs as a regular backend-project test so it executes on every CI backend
 * job against the auto-started docker postgres (docker-compose.test.yml; CI=1
 * caller-provided services) — no extra env plumbing. It does NOT use the
 * worker database: migrations must run against the synthetic minimal schema
 * (boardsesh_ticks without kilter_detached_at so 0163 exercises the ADD
 * COLUMN), so a throwaway database is created per vitest worker and dropped
 * afterwards. Schema, seed, migration application, and every assertion live in
 * @boardsesh/db/testing/dedup-replay, shared with the opt-in local harness
 * (packages/db dedup-migration-replay.integration.test.ts) so the two can't
 * drift.
 */

// Same admin-connection derivation as worker-db.ts getBaseConnection(): take
// DATABASE_URL (already rewritten to the worker DB by setup) and re-point the
// path at the maintenance database.
const ADMIN_URL = (
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/boardsesh_backend_test'
).replace(/\/[^/]+$/, '/postgres');

// Unique per vitest worker so parallel workers can't collide.
const DB_NAME = `bs_dedup_replay_w${process.env.VITEST_POOL_ID || '0'}`;

describe('PR4 dedup migration replay (0163→0165)', () => {
  let admin: postgres.Sql;
  let db: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
    db = postgres(ADMIN_URL.replace(/\/[^/]+$/, `/${DB_NAME}`), { max: 1, onnotice: () => {} });

    await prepareDedupReplayDatabase(db);
  });

  afterAll(async () => {
    if (db) await db.end().catch(() => {});
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => {});
      await admin.end().catch(() => {});
    }
  });

  for (const check of dedupReplayChecks) {
    it(check.name, async () => {
      await check.run(db);
    });
  }
});
