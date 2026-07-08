import { sql, and, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { boardSharedSyncs } from '../../schema/boards/unified';

type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

export const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Per-board "run this at most weekly" cursor, stored in `board_shared_syncs`
 * under a synthetic `__local_*` table name (which can never collide with an
 * Aurora-side table in a `/sync` response). Shared by the weekly
 * board_climb_stats_history snapshot and the weekly kilter stats-repair so both
 * ride the same battle-tested watermark mechanism the Aurora shared-sync
 * cursors already use.
 *
 * Pass the FULL cursor table name (e.g. `__local_climb_stats_history__`) so a
 * board mid-migration keeps its existing watermark byte-for-byte.
 */
export async function isWeeklyCursorDue(
  db: DrizzleDb,
  boardType: string,
  cursorTableName: string,
  intervalMs: number = WEEKLY_INTERVAL_MS,
): Promise<boolean> {
  const rows = await db
    .select({ lastSynchronizedAt: boardSharedSyncs.lastSynchronizedAt })
    .from(boardSharedSyncs)
    .where(and(eq(boardSharedSyncs.boardType, boardType), eq(boardSharedSyncs.tableName, cursorTableName)));
  if (rows.length === 0) return true;

  const raw = rows[0].lastSynchronizedAt;
  if (raw === null) return true;
  // last_synchronized_at is a Postgres timestamp string (no zone); treat as UTC.
  const lastMs = Date.parse(`${raw}Z`);
  if (Number.isNaN(lastMs)) return true;
  return Date.now() - lastMs >= intervalMs;
}

export async function markWeeklyCursorDone(db: DrizzleDb, boardType: string, cursorTableName: string): Promise<void> {
  // Match the `last_synchronized_at` text format Aurora uses elsewhere in this
  // table (`YYYY-MM-DD HH:MM:SS.ffffff`, no timezone), interpreted as UTC by
  // isWeeklyCursorDue above.
  const nowText = new Date().toISOString().replace('T', ' ').replace('Z', '');
  await db
    .insert(boardSharedSyncs)
    .values({ boardType, tableName: cursorTableName, lastSynchronizedAt: nowText })
    .onConflictDoUpdate({
      target: [boardSharedSyncs.boardType, boardSharedSyncs.tableName],
      set: { lastSynchronizedAt: sql`excluded.last_synchronized_at` },
    });
}
