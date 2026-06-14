import type { ActivityFeedInput } from '@boardsesh/shared-schema';

/** The two home-feed axes the toggle switches between. */
export type FeedMode = 'gym' | 'crew';

/**
 * Derive the `ActivityFeedInput` for the home feed from the current scope.
 *
 * - `crew`: people you follow, across all boards (`followingOnly`).
 * - `gym` + a `boardUuid`: everyone on that board (the user's home wall, or a
 *   board they switched to).
 * - `gym` + `null` boardUuid: "Everyone" — everyone, all boards (global
 *   discovery). The home screen also passes `null` when no home board could be
 *   inferred; in that case prefer defaulting the toggle to `crew` so a
 *   misconfigured user never lands on an unscoped firehose by accident.
 *
 * `limit`/`cursor` are owned by the paginator (`useSessionGroupedFeed` spreads
 * them in), so they're intentionally absent here.
 */
export function deriveFeedScopeInput(mode: FeedMode, boardUuid: string | null): ActivityFeedInput {
  if (mode === 'crew') {
    return { followingOnly: true, includeDailyHighlights: true };
  }
  if (boardUuid) {
    return { boardUuid, followingOnly: false, includeDailyHighlights: true };
  }
  return { boardUuid: null, followingOnly: false, includeDailyHighlights: true };
}
