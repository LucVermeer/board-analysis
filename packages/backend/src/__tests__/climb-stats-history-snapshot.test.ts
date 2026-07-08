import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import {
  snapshotClimbStatsHistoryIfDue,
  isClimbStatsHistorySnapshotDue,
  isWeeklyCursorDue,
  markWeeklyCursorDone,
} from '@boardsesh/db/queries';
import { getWorkerDatabaseUrl, setupWorkerDatabase } from './worker-db';

// ---------------------------------------------------------------------------
// Weekly board_climb_stats_history snapshot gate (real DB)
//
// Exercises the 7-day per-board cursor and the full-table snapshot end to end
// against a real Postgres. The cursor lives in board_shared_syncs under the
// synthetic table_name below; the snapshot copies the current state of every
// climb with ascents into board_climb_stats_history, gated by that cursor.
// ---------------------------------------------------------------------------

const HISTORY_CURSOR_TABLE_NAME = '__local_climb_stats_history__';

describe('snapshotClimbStatsHistoryIfDue — weekly gate (real DB)', () => {
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
      sql`TRUNCATE TABLE board_climb_stats, board_climb_stats_history, board_shared_syncs RESTART IDENTITY CASCADE`,
    );
  });

  // Postgres timestamp text with no zone, treated as UTC by isWeeklyCursorDue.
  function nowCursorText(): string {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
  }

  async function seedCursor(boardType: string, tableName: string, lastSynchronizedAt: string) {
    await db.execute(sql`
      INSERT INTO board_shared_syncs (board_type, table_name, last_synchronized_at)
      VALUES (${boardType}, ${tableName}, ${lastSynchronizedAt})
    `);
  }

  type SeedStats = {
    boardType: string;
    climbUuid: string;
    angle: number;
    ascensionistCount: number | null;
    displayDifficulty?: number | null;
    benchmarkDifficulty?: number | null;
    difficultyAverage?: number | null;
    qualityAverage?: number | null;
    faUsername?: string | null;
    faAt?: string | null;
  };

  async function seedStats(row: SeedStats) {
    await db.execute(sql`
      INSERT INTO board_climb_stats
        (board_type, climb_uuid, angle, display_difficulty, benchmark_difficulty,
         ascensionist_count, upstream_ascensionist_count, boardsesh_ascensionist_count,
         difficulty_average, quality_average, fa_username, fa_at)
      VALUES (${row.boardType}, ${row.climbUuid}, ${row.angle}, ${row.displayDifficulty ?? null},
              ${row.benchmarkDifficulty ?? null}, ${row.ascensionistCount}, ${row.ascensionistCount ?? 0}, 0,
              ${row.difficultyAverage ?? null}, ${row.qualityAverage ?? null},
              ${row.faUsername ?? null}, ${row.faAt ?? null})
    `);
  }

  type HistoryRow = {
    climb_uuid: string;
    angle: number;
    display_difficulty: number | string | null;
    benchmark_difficulty: number | string | null;
    ascensionist_count: number | string | null;
    difficulty_average: number | string | null;
    quality_average: number | string | null;
    fa_username: string | null;
    fa_at: string | null;
  };

  async function historyRows(boardType: string): Promise<HistoryRow[]> {
    const rows = (await db.execute(sql`
      SELECT climb_uuid, angle, display_difficulty, benchmark_difficulty, ascensionist_count,
             difficulty_average, quality_average, fa_username, fa_at
        FROM board_climb_stats_history
       WHERE board_type = ${boardType}
       ORDER BY climb_uuid
    `)) as unknown as HistoryRow[] | { rows: HistoryRow[] };
    return Array.isArray(rows) ? rows : rows.rows;
  }

  it('is due when no cursor row exists', async () => {
    expect(await isClimbStatsHistorySnapshotDue(db, 'kilter')).toBe(true);
  });

  it('is due when the cursor is older than 7 days', async () => {
    await seedCursor('kilter', HISTORY_CURSOR_TABLE_NAME, '2020-01-01 00:00:00.000000');
    expect(await isClimbStatsHistorySnapshotDue(db, 'kilter')).toBe(true);
  });

  it('is NOT due when the cursor is younger than 7 days', async () => {
    await seedCursor('kilter', HISTORY_CURSOR_TABLE_NAME, nowCursorText());
    expect(await isClimbStatsHistorySnapshotDue(db, 'kilter')).toBe(false);
  });

  it('isWeeklyCursorDue / markWeeklyCursorDone round-trip a generic cursor', async () => {
    const cursor = '__local_test_cursor__';
    // No row yet → due.
    expect(await isWeeklyCursorDue(db, 'tension', cursor)).toBe(true);
    await markWeeklyCursorDone(db, 'tension', cursor);
    // Just marked → not due under the 7-day window…
    expect(await isWeeklyCursorDue(db, 'tension', cursor)).toBe(false);
    // …but a zero interval always reports due (exercises the intervalMs arg).
    expect(await isWeeklyCursorDue(db, 'tension', cursor, 0)).toBe(true);
  });

  it('snapshots every ascended climb, excludes 0/NULL-ascent rows, and writes the cursor', async () => {
    // Board A (kilter): two ascended climbs, one 0-ascent, one NULL-ascent.
    await seedStats({
      boardType: 'kilter',
      climbUuid: 'K1',
      angle: 40,
      ascensionistCount: 5,
      displayDifficulty: 20.5,
      benchmarkDifficulty: 21,
      difficultyAverage: 20.7,
      qualityAverage: 3.4,
      faUsername: 'Alice',
      faAt: '2024-01-01 00:00:00',
    });
    await seedStats({
      boardType: 'kilter',
      climbUuid: 'K2',
      angle: 40,
      ascensionistCount: 3,
      displayDifficulty: 18,
      qualityAverage: 4.1,
      faUsername: 'Bob',
    });
    await seedStats({ boardType: 'kilter', climbUuid: 'K3', angle: 40, ascensionistCount: 0 });
    await seedStats({ boardType: 'kilter', climbUuid: 'K4', angle: 40, ascensionistCount: null });
    // Board B (tension): must NOT be copied by a kilter snapshot.
    await seedStats({ boardType: 'tension', climbUuid: 'T1', angle: 40, ascensionistCount: 9 });

    const logMessages: string[] = [];
    const first = await snapshotClimbStatsHistoryIfDue(db, 'kilter', (message) => logMessages.push(message));

    // Only the two ascensionist_count > 0 rows are written.
    expect(first.skipped).toBe(false);
    expect(first.written).toBe(2);
    // The logged count is the real inserted-row count, read back as a result
    // ROW (count(*) over the insert CTE) rather than driver metadata — it must
    // never report 0 for a non-empty write, whatever driver ran the statement.
    expect(logMessages.some((message) => message.includes('appended 2 rows'))).toBe(true);

    const kilterHistory = await historyRows('kilter');
    expect(kilterHistory.map((r) => r.climb_uuid)).toEqual(['K1', 'K2']);

    // Scoped per board: the tension row was never copied.
    expect(await historyRows('tension')).toHaveLength(0);

    // Columns are copied verbatim from board_climb_stats.
    const [k1] = kilterHistory;
    expect(Number(k1.ascensionist_count)).toBe(5);
    expect(Number(k1.display_difficulty)).toBe(20.5);
    expect(Number(k1.benchmark_difficulty)).toBe(21);
    expect(Number(k1.difficulty_average)).toBe(20.7);
    expect(Number(k1.quality_average)).toBe(3.4);
    expect(k1.fa_username).toBe('Alice');

    // The 7-day cursor was written, so an immediate second call is a no-op.
    const second = await snapshotClimbStatsHistoryIfDue(db, 'kilter');
    expect(second).toEqual({ written: 0, skipped: true });
    // No duplicate rows appended.
    expect(await historyRows('kilter')).toHaveLength(2);
  });

  it('a snapshot for board A never copies board B rows and leaves A untouched', async () => {
    await seedStats({ boardType: 'kilter', climbUuid: 'K1', angle: 40, ascensionistCount: 5 });
    await seedStats({ boardType: 'tension', climbUuid: 'T1', angle: 40, ascensionistCount: 9 });
    await seedStats({ boardType: 'tension', climbUuid: 'T2', angle: 40, ascensionistCount: 7 });

    const kilter = await snapshotClimbStatsHistoryIfDue(db, 'kilter');
    expect(kilter.written).toBe(1);
    expect(await historyRows('tension')).toHaveLength(0);

    const tension = await snapshotClimbStatsHistoryIfDue(db, 'tension');
    expect(tension.written).toBe(2);
    // The earlier kilter snapshot is unaffected by the tension pass.
    expect(await historyRows('kilter')).toHaveLength(1);
  });
});
