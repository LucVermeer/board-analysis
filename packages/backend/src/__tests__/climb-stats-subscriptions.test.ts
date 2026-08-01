import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { ClimbStatsEvent, ConnectionContext } from '@boardsesh/shared-schema';

const { subscribeMock, subscriptionState } = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
  subscriptionState: { push: null as ((event: ClimbStatsEvent) => void) | null, unsubscribe: vi.fn() },
}));

vi.mock('../pubsub/index', () => ({
  pubsub: {
    subscribeClimbStats: subscribeMock,
  },
}));

import { climbStatsSubscriptions } from '../graphql/resolvers/ticks/climb-stats-subscriptions';
import {
  acquireClimbStatsSubscription,
  getClimbStatsSubscriptionCount,
  MAX_CLIMB_STATS_SUBSCRIPTIONS_PER_CONNECTION,
  releaseClimbStatsSubscription,
  resetClimbStatsSubscriptionCountsForTests,
} from '../graphql/resolvers/ticks/climb-stats-subscription-counter';

function context(authenticated = true): ConnectionContext {
  return {
    isAuthenticated: authenticated,
    connectionId: 'connection-1',
  } as ConnectionContext;
}

const event: ClimbStatsEvent = {
  boardType: 'kilter',
  layoutId: 1,
  climbUuid: 'climb-1',
  angle: 40,
  ascensionistCount: 3,
  qualityAverage: 3,
  difficultyAverage: 18,
  displayDifficulty: 18,
  difficulty: '6b/V4',
  faUsername: null,
  faAt: null,
  syncSeq: '7',
};

describe('climbStatsUpdated subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClimbStatsSubscriptionCountsForTests();
    subscriptionState.push = null;
    subscribeMock.mockImplementation(async (_channelKey: string, push: (payload: ClimbStatsEvent) => void) => {
      subscriptionState.push = push;
      return subscriptionState.unsubscribe;
    });
  });

  it('requires authentication and validates the board/layout before subscribing', async () => {
    const anonymous = climbStatsSubscriptions.climbStatsUpdated.subscribe(
      undefined,
      { boardType: 'kilter', layoutId: 1 },
      context(false),
    );
    await expect(anonymous.next()).rejects.toThrow('Authentication required');

    const badBoard = climbStatsSubscriptions.climbStatsUpdated.subscribe(
      undefined,
      { boardType: 'notaboard', layoutId: 1 },
      context(),
    );
    await expect(badBoard.next()).rejects.toThrow('Invalid board type');

    const badLayout = climbStatsSubscriptions.climbStatsUpdated.subscribe(
      undefined,
      { boardType: 'kilter', layoutId: 0 },
      context(),
    );
    await expect(badLayout.next()).rejects.toThrow('Invalid layout id');
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('subscribes to the canonical layout channel and releases capacity on cleanup', async () => {
    const iterator = climbStatsSubscriptions.climbStatsUpdated.subscribe(
      undefined,
      { boardType: 'kilter', layoutId: 1 },
      context(),
    );
    const next = iterator.next();
    await vi.waitFor(() => expect(subscribeMock).toHaveBeenCalledWith('kilter:1', expect.any(Function)));
    expect(getClimbStatsSubscriptionCount('connection-1')).toBe(1);
    subscriptionState.push?.(event);
    await expect(next).resolves.toEqual({ done: false, value: { climbStatsUpdated: event } });

    await iterator.return?.(undefined);
    expect(subscriptionState.unsubscribe).toHaveBeenCalledTimes(1);
    expect(getClimbStatsSubscriptionCount('connection-1')).toBe(0);
  });

  it('caps subscriptions per connection without leaking rejected capacity', () => {
    for (let index = 0; index < MAX_CLIMB_STATS_SUBSCRIPTIONS_PER_CONNECTION; index += 1) {
      acquireClimbStatsSubscription('connection-1');
    }
    expect(() => acquireClimbStatsSubscription('connection-1')).toThrow('Too many climb-stats subscriptions');
    expect(getClimbStatsSubscriptionCount('connection-1')).toBe(MAX_CLIMB_STATS_SUBSCRIPTIONS_PER_CONNECTION);

    for (let index = 0; index < MAX_CLIMB_STATS_SUBSCRIPTIONS_PER_CONNECTION; index += 1) {
      releaseClimbStatsSubscription('connection-1');
    }
    expect(getClimbStatsSubscriptionCount('connection-1')).toBe(0);
  });
});
