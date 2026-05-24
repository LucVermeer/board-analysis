import type { ClimbQueueItem } from '@boardsesh/queue';

/**
 * Subscription event types matching the QUEUE_UPDATES_SUBSCRIPTION shape.
 * Defined here (rather than in the provider) so pure tests can import them
 * without pulling in React Native.
 */
export type SubscriptionClimb = {
  uuid: string;
  name: string;
  frames: string;
};

export type SubscriptionQueueItem = {
  uuid: string;
  climb: SubscriptionClimb;
};

/**
 * Convert a subscription queue item to a ClimbQueueItem compatible with the
 * shared reducer. The subscription only sends a subset of climb fields
 * (uuid, name, frames), so we fill in defaults for the rest.
 *
 * The Climb type requires these fields as non-nullable primitives, so we use
 * zero/empty defaults. The UI should prefer optional chaining (e.g.
 * `difficulty || null`) when distinguishing "no data" from a real value.
 */
export function toClimbQueueItem(subscriptionItem: SubscriptionQueueItem): ClimbQueueItem {
  return {
    uuid: subscriptionItem.uuid,
    climb: {
      uuid: subscriptionItem.climb.uuid,
      name: subscriptionItem.climb.name,
      frames: subscriptionItem.climb.frames,
      // Subscription-only stubs: the WS payload doesn't include these fields.
      // Non-nullable in the Climb type, so we use zero/empty defaults.
      setter_username: '',
      angle: 0,
      ascensionist_count: 0,
      difficulty: '',
      quality_average: '',
      stars: 0,
      difficulty_error: '',
      benchmark_difficulty: null,
    },
  };
}
