import { eq, sql } from 'drizzle-orm';
import type { ConnectionContext, BoardPresenceClimb, BoardPresenceStats } from '@boardsesh/shared-schema';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { pubsub } from '../../../pubsub/index';
import { requireBoardPresenceEnabled, assertValidBoardId } from './shared';

export const boardPresenceQueries = {
  /**
   * Backfill the recent "now on the wall" history for a board from the Redis
   * FIFO (last ~50, 24h window). Used by late joiners before the live
   * `boardNowPlaying` subscription takes over. Empty without Redis.
   */
  boardRecentClimbs: async (
    _: unknown,
    { boardId }: { boardId: number },
    _ctx: ConnectionContext,
  ): Promise<BoardPresenceClimb[]> => {
    requireBoardPresenceEnabled();
    assertValidBoardId(boardId);
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
    _ctx: ConnectionContext,
  ): Promise<BoardPresenceStats> => {
    requireBoardPresenceEnabled();
    assertValidBoardId(boardId);

    const [stats] = await db
      .select({
        climbsSentCount: sql<number>`COUNT(DISTINCT ${dbSchema.boardseshTicks.climbUuid})`,
        distinctClimbersCount: sql<number>`COUNT(DISTINCT ${dbSchema.boardseshTicks.userId})`,
        lastSentAt: sql<string | null>`MAX(${dbSchema.boardseshTicks.climbedAt})`,
      })
      .from(dbSchema.boardseshTicks)
      .where(eq(dbSchema.boardseshTicks.boardId, boardId));

    // climbedAt is a `mode: 'string'` timestamp column, so MAX() returns the
    // Postgres text form (e.g. "2026-06-09 12:00:00"). Normalise to ISO 8601
    // to match the rest of the presence surface (sentAt is `new Date().toISOString()`).
    const lastSentAtIso = stats?.lastSentAt ? new Date(stats.lastSentAt).toISOString() : null;

    return {
      climbsSentCount: Number(stats?.climbsSentCount ?? 0),
      distinctClimbersCount: Number(stats?.distinctClimbersCount ?? 0),
      // TODO(board-presence): resolve hardest/top grade names via the
      // board-specific difficulty-grade tables (see board leaderboard).
      hardestGrade: null,
      topGrade: null,
      lastSentAt: lastSentAtIso,
    };
  },
};
