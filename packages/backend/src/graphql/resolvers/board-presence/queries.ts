import type { ConnectionContext, BoardPresenceClimb, BoardPresenceStats } from '@boardsesh/shared-schema';
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
