import { randomUUID } from 'expo-crypto';
import type { Climb } from '@boardsesh/shared-schema';
import type { ClimbQueueItem } from '@boardsesh/queue';

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
      userAscents: climb.userAscents,
      userAttempts: climb.userAttempts,
    },
  };
}
