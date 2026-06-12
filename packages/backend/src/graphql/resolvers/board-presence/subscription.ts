import type { ConnectionContext, BoardPresenceEvent } from '@boardsesh/shared-schema';
import { pubsub } from '../../../pubsub/index';
import { createEagerAsyncIterator } from '../shared/async-iterators';
import { requireAuthenticated, applyRateLimit } from '../shared/helpers';
import { requireBoardPresenceEnabled, assertValidBoardId } from './shared';

export const boardPresenceSubscriptions = {
  /**
   * Live "now on the wall" feed for a shared board. Requires auth + a rate
   * limit (so an anonymous client can't loop board ids and grow the subscriber
   * set unbounded), but is otherwise membership-free: any authenticated user who
   * can name the board_id may watch. Keyed on the shared board_id; no driver.
   *
   * Eager subscribe: `createEagerAsyncIterator` awaits the Redis channel
   * subscribe before the first yield so a `reportBoardClimb` that lands during
   * setup isn't dropped.
   */
  boardNowPlaying: {
    subscribe: async function* (_: unknown, { boardId }: { boardId: number }, ctx: ConnectionContext) {
      requireBoardPresenceEnabled();
      requireAuthenticated(ctx);
      await applyRateLimit(ctx, 30, 'boardNowPlaying');
      assertValidBoardId(boardId);

      const boardKey = String(boardId);

      const asyncIterator = await createEagerAsyncIterator<BoardPresenceEvent>((push) => {
        return pubsub.subscribeBoardPresence(boardKey, push);
      });

      for await (const event of asyncIterator) {
        yield { boardNowPlaying: event };
      }
    },
  },
};
