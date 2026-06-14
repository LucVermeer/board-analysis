import { and, desc, eq, lt } from 'drizzle-orm';
import { GraphQLError } from 'graphql';
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
   * (survives past the 24h Redis window). Newest-first, keyset-paged via
   * `before`: an opaque cursor that is the `seq` of the last row of the
   * previous page.
   *
   * Ordering and the cursor are both on `seq`, which is unique and monotonic
   * per board (`board_climb_events_board_seq_unique`). That makes paging
   * tie-free — ordering by the second-granular `confirmedAt` could put several
   * rows at the same timestamp, where a `confirmedAt`-only cursor would repeat
   * or skip rows across pages.
   *
   * Intentionally public: a board's send log is shared, leaderboard-style data,
   * so any authenticated user may read any active board's history (no
   * membership check). Proof-of-presence gates *writes* (see reportBoardClimb),
   * not reads. `boardRecentClimbs` is the hot 24h cache for the same data.
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

    // Parse + validate the cursor before it reaches SQL, so a malformed value
    // returns a clean error instead of a leaked Postgres parse error. Trim
    // first and require digits only: `Number()` coerces whitespace/odd inputs
    // (" " -> 0, "1e3" -> 1000, "0x10" -> 16), which would silently return a
    // wrong/empty page. A blank/whitespace cursor is treated as "no cursor".
    let beforeSeq: number | null = null;
    const trimmedCursor = before?.trim();
    if (trimmedCursor) {
      if (!/^\d+$/.test(trimmedCursor)) {
        throw new GraphQLError('Invalid history cursor', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      beforeSeq = Number(trimmedCursor);
    }

    const cappedLimit = Math.min(Math.max(limit ?? 50, 1), 100);
    const boardMatch = eq(dbSchema.boardClimbEvents.boardId, boardId);
    const rows = await db
      .select()
      .from(dbSchema.boardClimbEvents)
      .where(beforeSeq !== null ? and(boardMatch, lt(dbSchema.boardClimbEvents.seq, beforeSeq)) : boardMatch)
      .orderBy(desc(dbSchema.boardClimbEvents.seq))
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
