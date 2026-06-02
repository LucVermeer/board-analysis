import type { Climb } from '@boardsesh/queue';

export const PLAYLIST_SUGGESTION_REFRESH_PAGE_SIZE = 100;
const MAX_PLAYLIST_SUGGESTION_REFRESH_PAGES = 10;
// Soft cap on the prefetched next-up swipe buffer per activation. Once the
// user swipes past the last loaded suggestion, the feed currently goes silent
// instead of paging the next batch in — tracked for follow-up as
// https://github.com/boardsesh/boardsesh/issues/2216 (infinite-scroll past
// the cap). Until then, 250 is enough for a full session for typical playlist
// sizes without burning a 10-page fetch on every activation.
const MAX_PLAYLIST_SUGGESTION_REFRESH_CLIMBS_AFTER_ACTIVE = 250;

type FetchPlaylistSuggestionPageArgs = {
  page: number;
  pageSize: number;
  signal: AbortSignal;
};

type PlaylistSuggestionPage = {
  climbs: Climb[];
  hasMore: boolean;
};

export function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const abortCandidate = err as { name?: unknown; code?: unknown };
  return abortCandidate.name === 'AbortError' || abortCandidate.code === 20;
}

export async function fetchPlaylistSuggestionClimbs({
  activatedClimbUuid,
  signal,
  fetchPage,
  pageSize = PLAYLIST_SUGGESTION_REFRESH_PAGE_SIZE,
  maxPages = MAX_PLAYLIST_SUGGESTION_REFRESH_PAGES,
  maxClimbsAfterActivated = MAX_PLAYLIST_SUGGESTION_REFRESH_CLIMBS_AFTER_ACTIVE,
}: {
  activatedClimbUuid: string;
  signal: AbortSignal;
  fetchPage: (args: FetchPlaylistSuggestionPageArgs) => Promise<PlaylistSuggestionPage>;
  pageSize?: number;
  maxPages?: number;
  maxClimbsAfterActivated?: number;
}): Promise<Climb[]> {
  const fetchedClimbs: Climb[] = [];
  let page = 0;
  let hasMore = true;
  let activatedClimbSeen = false;
  let loadedClimbsAfterActivated = 0;

  while (hasMore && page < maxPages && loadedClimbsAfterActivated < maxClimbsAfterActivated && !signal.aborted) {
    const pageResult = await fetchPage({ page, pageSize, signal });

    for (const pageClimb of pageResult.climbs) {
      if (pageClimb.uuid === activatedClimbUuid) {
        activatedClimbSeen = true;
        continue;
      }
      if (activatedClimbSeen) {
        loadedClimbsAfterActivated += 1;
      }
    }

    fetchedClimbs.push(...pageResult.climbs);
    hasMore = pageResult.hasMore;
    page += 1;
  }

  return fetchedClimbs;
}
