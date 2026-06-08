import { randomUUID } from 'expo-crypto';
import type { Climb, ClimbInput } from '@boardsesh/shared-schema';
import type { ClimbQueueItem } from '@boardsesh/queue';

/**
 * Map a `Climb` to the GraphQL `ClimbInput` for queue mutations. `ClimbInput` is
 * a strict subset of `Climb` — sending extra fields (notably `created_at`, which
 * search results carry but `ClimbInput` does not define) makes the server reject
 * the whole mutation ("Field \"created_at\" is not defined by type
 * \"ClimbInput\""), which silently breaks queue sync to party peers. TypeScript
 * won't catch the excess fields on a plain assignment, so build the input
 * explicitly here and let the `ClimbInput` return type pin the shape. Use this at
 * every wire boundary (add / setCurrent / setQueue) so it can't be bypassed by an
 * item built from a raw climb (e.g. `addToQueue({ uuid, climb })`).
 */
export function toClimbInput(climb: Climb): ClimbInput {
  return {
    uuid: climb.uuid,
    setter_username: climb.setter_username,
    userId: climb.userId,
    name: climb.name,
    description: climb.description,
    frames: climb.frames,
    angle: climb.angle,
    ascensionist_count: climb.ascensionist_count,
    difficulty: climb.difficulty,
    quality_average: climb.quality_average,
    stars: climb.stars,
    difficulty_error: climb.difficulty_error,
    mirrored: climb.mirrored,
    benchmark_difficulty: climb.benchmark_difficulty,
    is_no_match: climb.is_no_match,
    is_draft: climb.is_draft,
    published_at: climb.published_at,
    userAscents: climb.userAscents,
    userAttempts: climb.userAttempts,
    framesCount: climb.framesCount,
    framesPace: climb.framesPace,
  };
}

/**
 * Build a ClimbQueueItem from a Climb returned by SEARCH_CLIMBS / climb-detail
 * queries. The mutation input is GraphQL's `ClimbInput`, which is a strict
 * subset of `Climb` — passing the whole response (e.g. with `created_at`)
 * triggers a server-side validation error and surfaces as the generic
 * "Action failed" toast. Pick the exact fields here and let TypeScript verify
 * the shape, so callers can't drift.
 */
export function climbToQueueItem(climb: Climb, options?: { suggested?: boolean; uuid?: string }): ClimbQueueItem {
  return {
    uuid: options?.uuid ?? randomUUID(),
    suggested: options?.suggested,
    climb: {
      uuid: climb.uuid,
      name: climb.name,
      frames: climb.frames,
      setter_username: climb.setter_username,
      angle: climb.angle,
      ascensionist_count: climb.ascensionist_count,
      difficulty: climb.difficulty,
      quality_average: climb.quality_average,
      stars: climb.stars,
      difficulty_error: climb.difficulty_error,
      benchmark_difficulty: climb.benchmark_difficulty,
      is_no_match: climb.is_no_match,
      userAscents: climb.userAscents,
      userAttempts: climb.userAttempts,
    },
  };
}
