import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { isWeeklyCursorDue, markWeeklyCursorDone } from '../sync/weekly-gate';

// Any drizzle-orm PgDatabase (postgres-js client, the script client, the Neon
// HTTP client) and the PgTransaction the runners pass all satisfy this.
type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

// Synthetic `board_shared_syncs.table_name` row that records the last time we
// wrote a `board_climb_stats_history` snapshot for a board. Kept byte-identical
// to the cursor aurora-sync/shared-sync.ts used before this refactor so a board
// mid-migration keeps its existing 7-day watermark.
const HISTORY_CURSOR_TABLE_NAME = '__local_climb_stats_history__';

function affectedRowCount(result: unknown): number {
  if (result && typeof result === 'object') {
    const raw = result as { count?: number; rowCount?: number };
    const value = raw.count ?? raw.rowCount;
    if (value !== undefined) return Number(value);
  }
  return 0;
}

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

  const result = await db.execute(sql`
    INSERT INTO board_climb_stats_history
      (board_type, climb_uuid, angle, display_difficulty, benchmark_difficulty,
       ascensionist_count, difficulty_average, quality_average, fa_username, fa_at)
    SELECT board_type, climb_uuid, angle, display_difficulty, benchmark_difficulty,
           ascensionist_count, difficulty_average, quality_average, fa_username, fa_at
      FROM board_climb_stats
     WHERE board_type = ${boardType}
       AND ascensionist_count > 0
  `);

  const written = affectedRowCount(result);

  // Commit the watermark only after the insert succeeds, so a crash mid-insert
  // retries next cycle instead of silently skipping a week. (In a transaction
  // both roll back together; standalone, the insert is already durable.)
  await markWeeklyCursorDone(db, boardType, HISTORY_CURSOR_TABLE_NAME);
  log?.(`[history-snapshot] ${boardType}: appended ${written} rows to board_climb_stats_history`);

  return { written, skipped: false };
}
