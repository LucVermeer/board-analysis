import type { ClimbQueueItem } from '@boardsesh/queue';

/**
 * Subscription event types matching the QUEUE_UPDATES_SUBSCRIPTION shape.
 * Defined here (rather than in the provider) so pure tests can import them
 * without pulling in React Native.
 *
 * Keep these fields in sync with `SUBSCRIPTION_CLIMB_FIELDS` in
 * `src/lib/graphql/operations.ts` and with `climbToQueueItem` in
 * `src/components/play-drawer/PlayDrawer.tsx`. If the subscription drops a
 * field, the queue UI loses it on every server-driven update (FullSync on
 * connect, peer mutations), so the queue row's grade pill and the
 * re-opened play drawer end up blank.
 */
export type SubscriptionClimb = {
  uuid: string;
  name: string;
  frames: string;
  setter_username: string;
  angle: number;
  ascensionist_count: number;
  difficulty: string;
  quality_average: string;
  stars: number;
  difficulty_error: string;
  benchmark_difficulty: string | null;
};

export type SubscriptionQueueItem = {
  uuid: string;
  climb: SubscriptionClimb;
};

/**
 * Convert a subscription queue item to a ClimbQueueItem compatible with the
 * shared reducer. `userAscents` / `userAttempts` are user-specific and not
 * carried on subscription payloads — null is correct (mirrors what the
 * search query returns for unauthenticated lookups).
 */
export function toClimbQueueItem(subscriptionItem: SubscriptionQueueItem): ClimbQueueItem {
  return {
    uuid: subscriptionItem.uuid,
    climb: {
      uuid: subscriptionItem.climb.uuid,
      name: subscriptionItem.climb.name,
      frames: subscriptionItem.climb.frames,
      setter_username: subscriptionItem.climb.setter_username,
      angle: subscriptionItem.climb.angle,
      ascensionist_count: subscriptionItem.climb.ascensionist_count,
      difficulty: subscriptionItem.climb.difficulty,
      quality_average: subscriptionItem.climb.quality_average,
      stars: subscriptionItem.climb.stars,
      difficulty_error: subscriptionItem.climb.difficulty_error,
      benchmark_difficulty: subscriptionItem.climb.benchmark_difficulty,
    },
  };
}
