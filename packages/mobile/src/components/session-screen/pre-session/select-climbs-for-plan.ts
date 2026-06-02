import type { Climb, ClimbSearchInput, UserBoard } from '@boardsesh/shared-schema';
import type { ClimbQueueItem } from '@boardsesh/queue';
import type { GeneratorOptions, PlannedClimbSlot } from '@boardsesh/playlist-generator';
import { getHttpClient } from '../../../lib/graphql/client';
import { SEARCH_CLIMBS, type SearchClimbsQueryResponse } from '../../../lib/graphql/operations';
import { climbToQueueItem } from '../../../lib/climb-to-queue-item';

const POOL_SIZE_PER_GRADE = 50;

type SelectClimbsForPlanOptions = {
  /** Authenticated session — gates climbBias's hide/show-attempted filters,
   *  which require auth on the backend. */
  isAuthenticated?: boolean;
  /** Filters that survived the generator UI; mapped onto SEARCH_CLIMBS the
   *  same way the web `playlist-generator-drawer` maps them. */
  filters?: Pick<GeneratorOptions, 'minAscents' | 'minRating' | 'onlyTallClimbs' | 'climbBias'>;
};

/**
 * Turn a workout plan from `@boardsesh/playlist-generator` into a queue of
 * actual climbs by sampling SEARCH_CLIMBS one grade at a time. Mobile-only;
 * the equivalent web path lives in `playlist-generator-drawer.tsx`. The shared
 * package intentionally stays platform-agnostic (no GraphQL client).
 */
export async function selectClimbsForPlan(
  slots: PlannedClimbSlot[],
  board: UserBoard,
  options?: SelectClimbsForPlanOptions,
): Promise<ClimbQueueItem[]> {
  // Aggregate the unique target grades; one fetch per grade keeps round-trips
  // proportional to the workout shape rather than the climb count.
  const uniqueGrades = Array.from(new Set(slots.map((slot) => slot.grade)));

  const pools = new Map<number, Climb[]>();
  await Promise.all(
    uniqueGrades.map(async (grade) => {
      const input: ClimbSearchInput = {
        boardName: board.boardType,
        layoutId: board.layoutId,
        sizeId: board.sizeId,
        setIds: board.setIds,
        angle: board.angle,
        minGrade: grade,
        maxGrade: grade,
        gradeAccuracy: 'moderate',
        pageSize: POOL_SIZE_PER_GRADE,
        page: 1,
        // Quality-sorted so the generator favours the better climbs at each
        // grade rather than whatever happens to be most-recently published.
        sortBy: 'quality',
        sortOrder: 'desc',
        ...(options?.filters?.minAscents != null ? { minAscents: options.filters.minAscents } : {}),
        ...(options?.filters?.minRating != null ? { minRating: options.filters.minRating } : {}),
        ...(options?.filters?.onlyTallClimbs ? { onlyTallClimbs: true } : {}),
        // climbBias maps onto the auth-gated hide/show flags — same mapping as
        // the web generator. Anonymous users skip it entirely (the server
        // rejects these fields without a user context).
        ...(options?.isAuthenticated && options.filters?.climbBias === 'unfamiliar'
          ? { hideAttempted: true, hideCompleted: true }
          : {}),
        ...(options?.isAuthenticated && options.filters?.climbBias === 'attempted'
          ? { showOnlyAttempted: true }
          : {}),
      };
      const response = await getHttpClient().request<SearchClimbsQueryResponse>(SEARCH_CLIMBS, { input });
      const climbs = response.searchClimbs.climbs.slice();
      // Fisher–Yates: deterministic enough per call, randomized across calls so
      // two consecutive workouts at the same grade don't produce the same queue.
      for (let i = climbs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [climbs[i], climbs[j]] = [climbs[j], climbs[i]];
      }
      pools.set(grade, climbs);
    }),
  );

  const items: ClimbQueueItem[] = [];
  const usedUuids = new Set<string>();

  for (const slot of slots) {
    const pool = pools.get(slot.grade) ?? [];
    // Walk the shuffled pool past any climb we've already queued. If we run
    // out, fall back to reusing the first pool entry — better to repeat than
    // skip a planned slot in a short pool.
    const next = pool.find((climb) => !usedUuids.has(climb.uuid)) ?? pool[0];
    if (!next) continue;
    usedUuids.add(next.uuid);
    // ClimbInput (the GraphQL mutation surface) is a strict subset of Climb —
    // shape-pick via the shared helper so SEARCH_CLIMBS extras (`created_at`,
    // ...) don't trip server validation.
    items.push(climbToQueueItem(next, { suggested: true }));
  }

  return items;
}
