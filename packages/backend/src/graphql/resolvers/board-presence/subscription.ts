import type { ConnectionContext, BoardPresenceEvent } from '@boardsesh/shared-schema';
import { pubsub } from '../../../pubsub/index';
import { createEagerAsyncIterator } from '../shared/async-iterators';
import { requireBoardPresenceEnabled, assertValidBoardId } from './shared';

export const boardPresenceSubscriptions = {
  /**
   * Live "now on the wall" feed for a shared board. Membership-free — anyone
   * who has connected to the physical board (and can name its board_id) can
   * watch. Keyed on the shared board_id; no driver, no session.
   *
   * Eager subscribe: `createEagerAsyncIterator` awaits the Redis channel
   * subscribe before the first yield so a `reportBoardClimb` that lands during
   * setup isn't dropped.
   */
  boardNowPlaying: {
    subscribe: async function* (_: unknown, { boardId }: { boardId: number }, _ctx: ConnectionContext) {
      requireBoardPresenceEnabled();
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
