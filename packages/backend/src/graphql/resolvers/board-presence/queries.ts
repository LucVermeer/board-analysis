import { and, desc, eq, lt } from 'drizzle-orm';
import type { ConnectionContext, BoardPresenceClimb, BoardPresenceStats } from '@boardsesh/shared-schema';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { pubsub } from '../../../pubsub/index';
import { applyRateLimit, requireAuthenticated } from '../shared/helpers';
import { requireActiveBoardById, requireBoardPresenceEnabled } from './shared';
import { computeBoardPresenceStats } from './stats';

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
   * Durable history of what was pushed to a board, from `board_climb_events`
   * (survives past the 24h Redis window). Newest-first; keyset-paged via
   * `before` (an ISO confirmedAt cursor). This is the lasting "what was on the
   * wall" record; `boardRecentClimbs` is the hot 24h cache.
   */
  boardHistory: async (
    _: unknown,
    { boardId, limit, before }: { boardId: number; limit?: number | null; before?: string | null },
    ctx: ConnectionContext,
  ): Promise<BoardPresenceClimb[]> => {
    requireBoardPresenceEnabled();
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 60, 'boardHistory');
    await requireActiveBoardById(boardId);

    const cappedLimit = Math.min(Math.max(limit ?? 50, 1), 100);
    const boardMatch = eq(dbSchema.boardClimbEvents.boardId, boardId);
    const rows = await db
      .select()
      .from(dbSchema.boardClimbEvents)
      .where(before ? and(boardMatch, lt(dbSchema.boardClimbEvents.confirmedAt, before)) : boardMatch)
      .orderBy(desc(dbSchema.boardClimbEvents.confirmedAt), desc(dbSchema.boardClimbEvents.seq))
      .limit(cappedLimit);

    return rows.map((row) => ({
      climbUuid: row.climbUuid,
      queueItemUuid: null,
      name: row.name,
      grade: row.grade,
      gradeColor: null,
      frames: row.frames,
      angle: row.angle,
      setter: row.setter,
      sentByDisplayName: null,
      sentByAvatarUrl: null,
      sentAt: row.confirmedAt,
      seq: Number(row.seq),
    }));
  },

  /**
   * Durable stats for a board's wall feed, derived from `boardsesh_ticks`
   * stamped with this board_id.
   *
   * Includes the representative hardest send so the board sheet can show the
   * climber + climb that established the wall's hardest logged grade.
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
    return computeBoardPresenceStats(boardId, board.boardType);
  },
};
