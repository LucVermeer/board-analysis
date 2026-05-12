import { unstable_cache } from 'next/cache';
import { sortObjectKeys } from '@/app/lib/cache-utils';
import type { ParsedBoardRouteParameters, SearchRequestPagination } from '@/app/lib/types';
import { type HoldHeatmapData, getHoldHeatmapData } from './holds-heatmap';

/**
 * Cache duration for heatmap queries (in seconds).
 * Anonymous heatmap queries are cached for 30 days since aggregate data doesn't change
 * meaningfully. A weekly cron (see /api/internal/prewarm-heatmap/[board_name]) refreshes
 * the default zero-holds state for every board configuration so first-visit users always
 * hit a warm cache.
 */
export const CACHE_DURATION_HEATMAP = 30 * 24 * 60 * 60; // 30 days

/**
 * Cached version of getHoldHeatmapData — only used for anonymous requests.
 * User-specific data is not cached to ensure fresh personal progress data.
 *
 * IMPORTANT: The cache key shape here must exactly match what the heatmap GET route
 * builds, and what the prewarm endpoint passes in. Any drift means cache misses on
 * first-visit anonymous requests. All callers should go through this helper.
 */
export async function cachedGetHoldHeatmapData(
  params: ParsedBoardRouteParameters,
  searchParams: SearchRequestPagination,
): Promise<HoldHeatmapData[]> {
  // Build explicit cache key with board identifiers as separate segments
  // so cache hits/misses are correctly differentiated by board configuration.
  const cacheKey = [
    'heatmap',
    params.board_name,
    String(params.layout_id),
    String(params.size_id),
    params.set_ids.join(','),
    String(params.angle),
    // Sorted JSON of the filter subset that affects the query result.
    JSON.stringify(
      sortObjectKeys({
        gradeAccuracy: searchParams.gradeAccuracy,
        minGrade: searchParams.minGrade,
        maxGrade: searchParams.maxGrade,
        minAscents: searchParams.minAscents,
        minRating: searchParams.minRating,
        sortBy: searchParams.sortBy,
        sortOrder: searchParams.sortOrder,
        name: searchParams.name,
        settername: searchParams.settername,
        onlyClassics: searchParams.onlyClassics,
        onlyTallClimbs: searchParams.onlyTallClimbs,
        holdsFilter: searchParams.holdsFilter,
        zoneBox: searchParams.zoneBox,
        zoneMode: searchParams.zoneBox ? searchParams.zoneMode : undefined,
      }),
    ),
  ];

  const cachedFn = unstable_cache(async () => getHoldHeatmapData(params, searchParams, undefined), cacheKey, {
    revalidate: CACHE_DURATION_HEATMAP,
    tags: ['heatmap'],
  });

  return cachedFn();
}
