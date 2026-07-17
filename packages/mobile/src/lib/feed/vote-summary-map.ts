import type { SocialEntityType } from '@boardsesh/shared-schema';

/** Per-viewer vote state for one feed entity (a session or a tick). */
export type VoteSummary = {
  upvotes: number;
  userVote: number | null;
};

/** A single bulk-vote-summary row, keyed by the entity it belongs to. */
export type VoteSummaryEntry = {
  entityType: SocialEntityType;
  entityId: string;
  upvotes: number;
  userVote: number | null;
};

/** The composite key a feed row reads its summary by: `session:<id>` / `tick:<id>`. */
export function voteSummaryKey(entityType: SocialEntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Build the `key -> VoteSummary` map the home feed hands each card as
 * `voteSummary`, **preserving the previous value object** for any entity whose
 * `upvotes` + `userVote` are unchanged.
 *
 * Why identity matters: the feed passes the rebuilt map as FlashList
 * `extraData`, so every rebuild (a new page fetched mid-fling, a vote refetch,
 * the initial load) re-invokes `renderItem` for every mounted row. `SessionFeedCard`
 * is `React.memo`'d, so a row only re-renders its subtree when a prop identity
 * changes. If we minted a fresh `{ upvotes, userVote }` for every entity on
 * every rebuild, `voteSummary` would churn on all rows and defeat the memo —
 * the whole visible window would re-render each time. Reusing the prior object
 * for unchanged entities lets memo bail those rows, so only genuinely-changed
 * votes re-render.
 *
 * The returned `Map` reference is always new, which is intentional: `extraData`
 * relies on the reference changing to know a rebuild happened.
 */
export function buildVoteSummaryMap(
  previous: Map<string, VoteSummary> | null,
  entries: readonly VoteSummaryEntry[],
): Map<string, VoteSummary> {
  const next = new Map<string, VoteSummary>();
  for (const entry of entries) {
    const key = voteSummaryKey(entry.entityType, entry.entityId);
    const prior = previous?.get(key);
    next.set(
      key,
      prior && prior.upvotes === entry.upvotes && prior.userVote === entry.userVote
        ? prior
        : { upvotes: entry.upvotes, userVote: entry.userVote },
    );
  }
  return next;
}
