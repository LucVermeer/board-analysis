import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ConnectionContext, BoardPresenceClimb, BoardPresenceStats } from '@boardsesh/shared-schema';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { pubsub } from '../../../pubsub/index';
import { applyRateLimit, requireAuthenticated } from '../shared/helpers';
import { requireActiveBoardById, requireBoardPresenceEnabled } from './shared';

type DifficultyRow = {
  difficulty: number | null;
};

function parsePostgresUtcTimestamp(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const isoLikeTimestamp = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T');
  const zonedTimestamp = /(?:Z|[+-]\d{2}:?\d{2})$/.test(isoLikeTimestamp) ? isoLikeTimestamp : `${isoLikeTimestamp}Z`;
  return new Date(zonedTimestamp).toISOString();
}

async function resolveGradeNames(
  boardType: string,
  difficulties: Array<number | null | undefined>,
): Promise<Map<number, string>> {
  const uniqueDifficulties = [
    ...new Set(difficulties.filter((difficulty): difficulty is number => difficulty != null)),
  ];
  if (uniqueDifficulties.length === 0) return new Map();

  const rows = await db
    .select({
      difficulty: dbSchema.boardDifficultyGrades.difficulty,
      boulderName: dbSchema.boardDifficultyGrades.boulderName,
    })
    .from(dbSchema.boardDifficultyGrades)
    .where(
      and(
        eq(dbSchema.boardDifficultyGrades.boardType, boardType),
        inArray(dbSchema.boardDifficultyGrades.difficulty, uniqueDifficulties),
      ),
    );

  return new Map(rows.map((row) => [row.difficulty, row.boulderName ?? String(row.difficulty)]));
}

function gradeNameFor(difficulty: number | null | undefined, gradeNames: Map<number, string>): string | null {
  if (difficulty == null) return null;
  return gradeNames.get(difficulty) ?? String(difficulty);
}

export const boardPresenceQueries = {
  /**
   * Backfill the recent "now on the wall" history for a board from the Redis
   * FIFO (last ~50, 24h window). Used by late joiners before the live
   * `boardNowPlaying` subscription takes over. Empty without Redis.
   */
  boardRecentClimbs: async (
    _: unknown,
    { boardId }: { boardId: number },
    ctx: ConnectionContext,
  ): Promise<BoardPresenceClimb[]> => {
    requireBoardPresenceEnabled();
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 60, 'boardRecentClimbs');
    await requireActiveBoardById(boardId);
    return pubsub.getRecentBoardClimbs(String(boardId));
  },

  /**
   * Durable stats for a board's wall feed, derived from `boardsesh_ticks`
   * stamped with this board_id.
   *
   * v1 keeps it to what a single grouped query over the ticks table can
   * answer cheaply: distinct climbs, distinct climbers, and the most recent
   * send. `hardestGrade` / `topGrade` need a grade-name join across the
   * board-specific difficulty tables (the same TODO the board leaderboard
   * carries) — left null for now rather than shipping an approximate label.
   */
  boardPresenceStats: async (
    _: unknown,
    { boardId }: { boardId: number },
    ctx: ConnectionContext,
  ): Promise<BoardPresenceStats> => {
    requireBoardPresenceEnabled();
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 30, 'boardPresenceStats');
    const board = await requireActiveBoardById(boardId);

    const [stats] = await db
      .select({
        climbsSentCount: sql<number>`COUNT(DISTINCT ${dbSchema.boardseshTicks.climbUuid}) FILTER (WHERE ${dbSchema.boardseshTicks.status} IN ('send', 'flash'))`,
        distinctClimbersCount: sql<number>`COUNT(DISTINCT ${dbSchema.boardseshTicks.userId})`,
        lastSentAt: sql<
          string | null
        >`MAX(${dbSchema.boardseshTicks.climbedAt}) FILTER (WHERE ${dbSchema.boardseshTicks.status} IN ('send', 'flash'))`,
        hardestDifficulty: sql<
          number | null
        >`MAX(COALESCE(${dbSchema.boardseshTicks.difficulty}, ROUND(${dbSchema.boardClimbStats.displayDifficulty})::int)) FILTER (WHERE ${dbSchema.boardseshTicks.status} IN ('send', 'flash'))`,
      })
      .from(dbSchema.boardseshTicks)
      .leftJoin(
        dbSchema.boardClimbStats,
        and(
          eq(dbSchema.boardClimbStats.boardType, dbSchema.boardseshTicks.boardType),
          eq(dbSchema.boardClimbStats.climbUuid, dbSchema.boardseshTicks.climbUuid),
          eq(dbSchema.boardClimbStats.angle, dbSchema.boardseshTicks.angle),
        ),
      )
      .where(eq(dbSchema.boardseshTicks.boardId, boardId));

    const topGradeRows = await db.execute(sql<DifficultyRow>`
      SELECT tick_difficulties.difficulty
      FROM (
        SELECT COALESCE(t.difficulty, ROUND(s.display_difficulty)::int) AS difficulty
        FROM boardsesh_ticks t
        LEFT JOIN board_climb_stats s
          ON s.board_type = t.board_type
         AND s.climb_uuid = t.climb_uuid
         AND s.angle = t.angle
        WHERE t.board_id = ${boardId}
          AND t.status IN ('send', 'flash')
      ) tick_difficulties
      WHERE tick_difficulties.difficulty IS NOT NULL
      GROUP BY tick_difficulties.difficulty
      ORDER BY COUNT(*) DESC, tick_difficulties.difficulty DESC
      LIMIT 1
    `);
    const topGradeRow = topGradeRows[0] as DifficultyRow | undefined;
    const gradeNames = await resolveGradeNames(board.boardType, [stats?.hardestDifficulty, topGradeRow?.difficulty]);

    return {
      climbsSentCount: Number(stats?.climbsSentCount ?? 0),
      distinctClimbersCount: Number(stats?.distinctClimbersCount ?? 0),
      hardestGrade: gradeNameFor(stats?.hardestDifficulty, gradeNames),
      topGrade: gradeNameFor(topGradeRow?.difficulty, gradeNames),
      lastSentAt: parsePostgresUtcTimestamp(stats?.lastSentAt),
    };
  },
};
