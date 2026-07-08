import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { recomputeClimbStatsBulk, type ClimbStatsKey } from '../recompute';
import { sqlText } from '../../../test-utils/sql-text';

type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

// Capture every db.execute(...) call so we can assert the chunking + dedup
// behaviour of recomputeClimbStatsBulk without a real Postgres. The SQL's
// counting correctness is covered end-to-end by the backend provenance-matrix
// integration test (recompute-climb-stats.test.ts).
function makeDb() {
  const queries: unknown[] = [];
  const handle = {
    execute: (query: unknown) => {
      queries.push(query);
      return Promise.resolve([]);
    },
  };
  return { queries, handle: handle as unknown as DrizzleDb };
}

void describe('recomputeClimbStatsBulk', () => {
  void it('is a no-op (no queries) when given no keys', async () => {
    const db = makeDb();
    await recomputeClimbStatsBulk(db.handle, []);
    assert.equal(db.queries.length, 0);
  });

  void it('emits one seed INSERT + one aggregate UPDATE for a single chunk', async () => {
    const db = makeDb();
    await recomputeClimbStatsBulk(db.handle, [{ boardType: 'kilter', climbUuid: 'A', angle: 40 }]);

    assert.equal(db.queries.length, 2);
    assert.match(sqlText(db.queries[0]), /INSERT INTO board_climb_stats/);
    const updateSql = sqlText(db.queries[1]);
    assert.match(updateSql, /UPDATE board_climb_stats/);
    // The counting rule + provenance guard must be present in the UPDATE. The
    // guard is FLASH/SEND-scoped: an imported attempt must not disqualify a
    // native send (upstream counts have no bids).
    assert.match(updateSql, /bool_or\(bt\.origin <> 'native' AND bt\.status IN \('flash','send'\)\)/);
    assert.match(updateSql, /has_send AND NOT has_upstream/);
    // Owned-climb quality: quality = 0 sentinel excluded; ascensionist = upstream + boardsesh.
    assert.match(updateSql, /AVG\(NULLIF\(bt\.quality, 0\)\)/);
    // Kilter-detached (upstream-deleted) rows must be excluded from the count.
    assert.match(updateSql, /kilter_detached_at IS NULL/);
    // Quality blend — the Boardsesh side (one vote per climber = LATEST rated
    // native flash/send tick) and the blended non-owned quality_average.
    assert.match(updateSql, /boardsesh_quality_sum\s*=\s*bq\.bs_quality_sum/);
    assert.match(updateSql, /boardsesh_quality_count\s*=\s*NULLIF\(bq\.bs_quality_count, 0\)/);
    // The vote query: native-only, rated, one row per user (latest wins).
    assert.match(updateSql, /DISTINCT ON \(bt\.board_type, bt\.climb_uuid, bt\.angle, bt\.user_id\)/);
    assert.match(updateSql, /bt\.origin = 'native'/);
    assert.match(updateSql, /bt\.quality >= 1/);
    assert.match(updateSql, /ORDER BY[\s\S]*bt\.climbed_at DESC, bt\.id DESC/);
    // Non-owned quality_average is the blend (division by the summed weights),
    // NOT the plain upstream value.
    assert.match(updateSql, /COALESCE\(s\.upstream_quality_average \* s\.upstream_ascensionist_count, 0\)/);
    assert.match(
      updateSql,
      /CASE WHEN s\.upstream_quality_average IS NOT NULL THEN s\.upstream_ascensionist_count END/,
    );
  });

  void it('dedupes identical keys into a single chunk', async () => {
    const db = makeDb();
    // 600 copies of ONE key: without dedup that would be 2 chunks (4 queries);
    // deduped to 1 distinct key it must be a single chunk (2 queries).
    const dupes: ClimbStatsKey[] = Array.from({ length: 600 }, () => ({
      boardType: 'kilter',
      climbUuid: 'A',
      angle: 40,
    }));
    await recomputeClimbStatsBulk(db.handle, dupes);
    assert.equal(db.queries.length, 2);
  });

  void it('treats same climb at different angles as distinct keys', async () => {
    const db = makeDb();
    await recomputeClimbStatsBulk(db.handle, [
      { boardType: 'kilter', climbUuid: 'A', angle: 40 },
      { boardType: 'kilter', climbUuid: 'A', angle: 50 },
    ]);
    // 2 distinct keys still fit one chunk → seed + update.
    assert.equal(db.queries.length, 2);
  });

  void it('chunks distinct keys into batches of 500', async () => {
    const db = makeDb();
    const keys: ClimbStatsKey[] = Array.from({ length: 501 }, (_, i) => ({
      boardType: 'kilter',
      climbUuid: `C${i}`,
      angle: 40,
    }));
    await recomputeClimbStatsBulk(db.handle, keys);

    // 501 distinct keys → 2 chunks (500 + 1) → 2 queries each = 4 total.
    assert.equal(db.queries.length, 4);
  });
});
