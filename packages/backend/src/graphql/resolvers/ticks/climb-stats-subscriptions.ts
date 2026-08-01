import { SUPPORTED_BOARDS, type ClimbStatsEvent, type ConnectionContext } from '@boardsesh/shared-schema';
import { pubsub } from '../../../pubsub/index';
import { createAsyncIterator } from '../shared/async-iterators';
import { requireAuthenticated } from '../shared/helpers';
import { acquireClimbStatsSubscription, releaseClimbStatsSubscription } from './climb-stats-subscription-counter';

const VALID_BOARD_TYPES = new Set<string>(SUPPORTED_BOARDS);
const MAX_LAYOUT_ID = 1_000_000;

export const climbStatsSubscriptions = {
  climbStatsUpdated: {
    subscribe: async function* (
      _: unknown,
      { boardType, layoutId }: { boardType: string; layoutId: number },
      ctx: ConnectionContext,
    ) {
      requireAuthenticated(ctx);
      if (!VALID_BOARD_TYPES.has(boardType)) throw new Error(`Invalid board type: ${boardType}`);
      if (!Number.isInteger(layoutId) || layoutId < 1 || layoutId > MAX_LAYOUT_ID) {
        throw new Error(`Invalid layout id: ${layoutId}`);
      }

      acquireClimbStatsSubscription(ctx.connectionId);
      try {
        const channelKey = `${boardType}:${layoutId}`;
        const iterator = await createAsyncIterator<ClimbStatsEvent>(
          (push) => pubsub.subscribeClimbStats(channelKey, push),
          `climbStatsUpdated:${channelKey}`,
        );
        for await (const event of iterator) {
          yield { climbStatsUpdated: event };
        }
      } finally {
        releaseClimbStatsSubscription(ctx.connectionId);
      }
    },
  },
};
