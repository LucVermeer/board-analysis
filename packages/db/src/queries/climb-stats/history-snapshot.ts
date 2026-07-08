import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { isWeeklyCursorDue, markWeeklyCursorDone } from '../sync/weekly-gate';
import { rowsOf } from '../util/rows';

// Any drizzle-orm PgDatabase (postgres-js client, the script client, the Neon
// HTTP client) and the PgTransaction the runners pass all satisfy this.
type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

// Synthetic `board_shared_syncs.table_name` row that records the last time we
// wrote a `board_climb_stats_history` snapshot for a board. Kept byte-identical
// to the cursor aurora-sync/shared-sync.ts used before this refactor so a board
// mid-migration keeps its existing 7-day watermark.
const HISTORY_CURSOR_TABLE_NAME = '__local_climb_stats_history__';

/**
 * True when this board's weekly `board_climb_stats_history` snapshot is due
 * (≥7 days since the last one, or never taken).
 */
export async function isClimbStatsHistorySnapshotDue(db: DrizzleDb, boardType: string): Promise<boolean> {
  return isWeeklyCursorDue(db, boardType, HISTORY_CURSOR_TABLE_NAME);
}

export type ClimbStatsHistorySnapshotResult = {
  /** rows appended to board_climb_stats_history (0 when skipped). */
  written: number;
  /** true when the 7-day watermark had not elapsed (nothing written). */
  skipped: boolean;
};

/**
 * Board-agnostic weekly `board_climb_stats_history` snapshot. Gated per board by
 * the same 7-day cursor as {@link isClimbStatsHistorySnapshotDue}; when due it
 * appends the CURRENT full state of every climb on the board that has any
 * ascents, in a single `INSERT … SELECT`.
 *
 * This replaces the old Aurora delta-piggyback (which only captured the rows a
 * given ~1-hour `/sync` batch happened to touch — a tiny, biased slice) and the
 * absent kilter/moonboard writers (kilter history froze in March; moonboard
 * never had one). The full-table snapshot is what the grade backtest (gates.ts)
 * assumes: a coherent weekly cross-section of every established climb.
 *
 * Bounded to `ascensionist_count > 0` so unclimbed rows never enter the series.
 * Served by board_climb_stats_ascents_covering_v2_idx (board_type,
 * ascensionist_count). The caller decides cadence; this only writes when the
 * watermark says a week has passed, so calling it every daemon cycle is safe.
 */
export async function snapshotClimbStatsHistoryIfDue(
  db: DrizzleDb,
  boardType: string,
  log?: (message: string) => void,
): Promise<ClimbStatsHistorySnapshotResult> {
  if (!(await isClimbStatsHistorySnapshotDue(db, boardType))) {
    return { written: 0, skipped: true };
  }

  log?.(`[history-snapshot] weekly board_climb_stats_history snapshot is due for ${boardType}`);

  // The INSERT and the watermark commit run in ONE transaction so they are
  // both-or-neither. If the process crashes between them, an uncommitted
  // transaction rolls back entirely: the next cycle re-runs the snapshot
  // cleanly instead of appending a SECOND weekly cross-section on top of the
  // first (a duplicate week pollutes the grade backtest in gates.ts, which
  // assumes one snapshot per board per week). A partial insert with no
  // watermark would otherwise re-insert every cycle until a full run happened
  // to complete both statements.
  const written = await db.transaction(async (tx) => {
    // The inserted-row count is read back as a normal result ROW (count the
    // CTE's RETURNING server-side), not from driver metadata: postgres-js puts
    // the command-tag count on a RowList property while the Neon HTTP client
    // uses `rowCount`, and drizzle's execute() doesn't normalize the two — a
    // metadata read can silently be 0 on the wrong driver. A row is a row on
    // every driver. RETURNING 1 (not *) keeps the wire/CTE payload minimal.
    const result = await tx.execute(sql`
      WITH inserted AS (
        INSERT INTO board_climb_stats_history
          (board_type, climb_uuid, angle, display_difficulty, benchmark_difficulty,
           ascensionist_count, difficulty_average, quality_average, fa_username, fa_at)
        SELECT board_type, climb_uuid, angle, display_difficulty, benchmark_difficulty,
               ascensionist_count, difficulty_average, quality_average, fa_username, fa_at
          FROM board_climb_stats
         WHERE board_type = ${boardType}
           AND ascensionist_count > 0
        RETURNING 1
      )
      SELECT count(*)::int AS written FROM inserted
    `);

    const insertedCount = Number(rowsOf<{ written: number | string }>(result)[0]?.written ?? 0);
    await markWeeklyCursorDone(tx, boardType, HISTORY_CURSOR_TABLE_NAME);
    return insertedCount;
  });

  log?.(`[history-snapshot] ${boardType}: appended ${written} rows to board_climb_stats_history`);

  return { written, skipped: false };
}
