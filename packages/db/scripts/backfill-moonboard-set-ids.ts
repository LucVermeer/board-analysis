/**
 * Backfill required_set_ids on MoonBoard board_climbs.
 *
 * MoonBoard climbs are imported with NULL required_set_ids. This derives the set
 * each climb needs from the grid cells its holds occupy (the cell -> set map in
 * @boardsesh/board-config) so the search set filter can exclude climbs that use
 * holds the user doesn't own (e.g. wooden holds). Idempotent — safe to re-run,
 * and intended to run after a fresh MoonBoard catalog import.
 *
 * Run from the full monorepo (board-config + the cell-set map must resolve):
 *   DB_URL=<target> vp run db:backfill-moonboard-set-ids [-- --batch-size 5000 --dry-run]
 */

import { sql } from 'drizzle-orm';
import { createScriptDb } from './db-connection.js';
import { executeRows } from '../src/client/index.js';
import { populateMoonBoardRequiredSetIds } from '../src/queries/climbs/moonboard-set-ids.js';

const args = process.argv.slice(2);
const batchSize = args.includes('--batch-size') ? Number(args[args.indexOf('--batch-size') + 1]) : 5000;
const dryRun = args.includes('--dry-run');

async function main() {
  const { db, close } = createScriptDb();

  try {
    const [{ total }] = await executeRows<{ total: string }>(
      db,
      sql`
        SELECT COUNT(*) AS total
        FROM board_climbs
        WHERE board_type = 'moonboard'
          AND frames IS NOT NULL
          AND frames != ''
      `,
    );
    const totalEligible = Number(total);
    console.info(`MoonBoard climbs eligible for backfill: ${totalEligible.toLocaleString()}`);

    if (dryRun) {
      console.info('Dry run — no changes will be made.');
      return;
    }
    if (totalEligible === 0) {
      console.info('Nothing to do.');
      return;
    }

    // Keyset pagination by uuid: the helper recomputes required_set_ids for the
    // given batch, so there is no shrinking predicate — advance the cursor each
    // batch through the whole table in stable order.
    let cursor = '';
    let processed = 0;
    while (true) {
      const batchRows = await executeRows<{ uuid: string }>(
        db,
        sql`
          SELECT uuid
          FROM board_climbs
          WHERE board_type = 'moonboard'
            AND uuid > ${cursor}
            AND frames IS NOT NULL
            AND frames != ''
          ORDER BY uuid
          LIMIT ${batchSize}
        `,
      );

      const uuids = batchRows.map((row) => row.uuid);
      if (uuids.length === 0) break;

      await populateMoonBoardRequiredSetIds(db, uuids);
      processed += uuids.length;
      cursor = uuids[uuids.length - 1];

      const pct = totalEligible > 0 ? ((processed / totalEligible) * 100).toFixed(1) : '100';
      console.info(`  ${processed.toLocaleString()} / ${totalEligible.toLocaleString()} (${pct}%)`);

      if (uuids.length < batchSize) break;
    }

    // Data-quality report. A real climb should map to at least its base sets;
    // an empty array means every hold landed on an uncovered cell (suspicious —
    // worth investigating the art/map), and NULL means the climb was skipped.
    console.info('\nVerification:');
    const breakdown = await executeRows<{ state: string; count: string }>(
      db,
      sql`
        SELECT
          CASE
            WHEN required_set_ids IS NULL THEN 'null'
            WHEN cardinality(required_set_ids) = 0 THEN 'empty (all cells uncovered)'
            ELSE 'populated'
          END AS state,
          COUNT(*) AS count
        FROM board_climbs
        WHERE board_type = 'moonboard'
          AND frames IS NOT NULL
          AND frames != ''
        GROUP BY state
        ORDER BY state
      `,
    );
    for (const row of breakdown) {
      console.info(`  ${row.state}: ${Number(row.count).toLocaleString()}`);
    }
    console.info(`\nDone — ${processed.toLocaleString()} MoonBoard climbs recomputed.`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
