import type { Climb } from '@boardsesh/shared-schema';

/**
 * Accumulate climbs across paginated results, deduplicating by UUID.
 *
 * - Page 1 replaces the entire list (fresh search / pull-to-refresh).
 * - Page 2+ appends only climbs whose UUID is not already present.
 */
export function accumulateClimbs(existing: Climb[], newClimbs: Climb[], pageNumber: number): Climb[] {
  if (pageNumber === 1) return newClimbs;

  const existingUuids = new Set(existing.map((climb) => climb.uuid));
  const uniqueNewClimbs = newClimbs.filter((climb) => !existingUuids.has(climb.uuid));
  return [...existing, ...uniqueNewClimbs];
}
