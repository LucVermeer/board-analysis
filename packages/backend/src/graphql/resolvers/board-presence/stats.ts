// Board-presence durable stats: computation + live push.
//
// Stats (sends / climbers / hardest / top grade) are derived from
// `boardsesh_ticks` stamped with a board_id. The `boardPresenceStats` query
// reads them on demand; `publishBoardStats` recomputes and pushes a
// `BoardStatsUpdated` event over the same `boardNowPlaying` subscription as
// climb events, so every watcher's tiles update live the moment a tick lands —
// no client re-fetch. Both go through the same computation so the live push and
// a later cold fetch never disagree.

import { randomUUID } from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BoardPresenceStats } from '@boardsesh/shared-schema';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { pubsub } from '../../../pubsub/index';
import { redisClientManager } from '../../../redis/client';
import { logger } from '../../../utils/logger';

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

/**
 * Compute a board's durable wall stats from `boardsesh_ticks`. The single
 * source of truth for both the `boardPresenceStats` query and the live push.
 */
export async function computeBoardPresenceStats(boardId: number, boardType: string): Promise<BoardPresenceStats> {
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
  const gradeNames = await resolveGradeNames(boardType, [stats?.hardestDifficulty, topGradeRow?.difficulty]);

  return {
    climbsSentCount: Number(stats?.climbsSentCount ?? 0),
    distinctClimbersCount: Number(stats?.distinctClimbersCount ?? 0),
    hardestGrade: gradeNameFor(stats?.hardestDifficulty, gradeNames),
    topGrade: gradeNameFor(topGradeRow?.difficulty, gradeNames),
    lastSentAt: parsePostgresUtcTimestamp(stats?.lastSentAt),
  };
}

/**
 * Recompute a board's stats and push them to its live `boardNowPlaying` feed as
 * a `BoardStatsUpdated` event. Reached only through `queueBoardStatsPublish`,
 * which serializes calls per board — so the compute→seq ordering here is safe:
 * the seq that labels a snapshot is allocated within the same (non-overlapping)
 * execution that read it, so a higher seq always carries an equal-or-newer
 * snapshot. The reducer relies on exactly that invariant.
 *
 * Never throws: a failed stats push must not fail the tick that triggered it.
 */
export async function publishBoardStats(boardId: number, boardType: string): Promise<void> {
  try {
    const stats = await computeBoardPresenceStats(boardId, boardType);
    const seq = await pubsub.nextBoardSeq(String(boardId));
    pubsub.publishBoardPresenceEvent(String(boardId), {
      __typename: 'BoardStatsUpdated',
      stats,
      seq,
    });
  } catch (error) {
    logger.warn(`[board-presence] publishBoardStats failed for board ${boardId}: ${String(error)}`);
  }
}

const STATS_DEBOUNCE_MS = 2000;
const STATS_DEBOUNCE_REDIS_PREFIX = 'boardsesh:debounce:board-stats:';

// Local timers, one per board. Each new tick clears and re-arms the board's
// timer, so only one publish is ever pending per board (trailing edge).
const pendingBoardStats = new Map<number, ReturnType<typeof setTimeout>>();

/**
 * Debounced entry point for the board-stats push. A burst of ticks on one wall
 * (two climbers, or one climber logging fast) collapses into a single trailing
 * recompute+publish per board, which:
 *   1. removes redundant 2-query recomputes per tick, and
 *   2. SERIALIZES the publish per board, so two ticks can never run two
 *      concurrent compute→seq→publish cycles and pair a staler snapshot with a
 *      higher seq (which would regress the live tiles). One pending timer per
 *      board guarantees one execution at a time.
 *
 * Multi-instance: a Redis nonce (last writer wins) makes only the instance that
 * received the latest tick actually publish, so the global feed still sees one
 * monotonic push per window. Falls back to local-only debounce without Redis.
 * Mirrors `publishDebouncedSessionStats` / `queueClimbStatsRecompute`.
 */
export function queueBoardStatsPublish(boardId: number, boardType: string): void {
  const existing = pendingBoardStats.get(boardId);
  if (existing) {
    clearTimeout(existing);
  }

  const nonce = randomUUID();
  const redisKey = `${STATS_DEBOUNCE_REDIS_PREFIX}${boardId}`;

  if (redisClientManager.isRedisConnected()) {
    const { publisher } = redisClientManager.getClients();
    publisher.set(redisKey, nonce, 'PX', STATS_DEBOUNCE_MS + 500).catch((error) => {
      logger.error(`[board-presence] board-stats debounce Redis SET failed for board ${boardId}:`, error);
    });
  }

  pendingBoardStats.set(
    boardId,
    setTimeout(async () => {
      pendingBoardStats.delete(boardId);

      // Multi-instance: only the instance holding the latest nonce publishes.
      if (redisClientManager.isRedisConnected()) {
        try {
          const { publisher } = redisClientManager.getClients();
          const current = await publisher.get(redisKey);
          if (current !== nonce) {
            return;
          }
          await publisher.del(redisKey);
        } catch (error) {
          logger.error(
            `[board-presence] board-stats debounce Redis GET failed for board ${boardId}, publishing anyway:`,
            error,
          );
          // Fall through: a duplicate push is harmless (seq-gated), a drop is not.
        }
      }

      await publishBoardStats(boardId, boardType);
    }, STATS_DEBOUNCE_MS),
  );
}
