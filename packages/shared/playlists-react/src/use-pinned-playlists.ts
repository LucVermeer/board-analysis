import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GET_MY_PINNED_PLAYLISTS,
  type GetMyPinnedPlaylistsQueryResponse,
  type GetMyPinnedPlaylistsQueryVariables,
  type Playlist,
} from '@boardsesh/graphql/operations/playlists';
import { usePlaylistsAdapter, type ExecutePlaylistsGraphQL } from './adapter';
import type { RecentPlaylistEntry, RecentsStorageAdapter } from './recents-adapter';

export type UsePinnedPlaylistsOptions = {
  /** Auth token (when null, server-side pinned is skipped). */
  token: string | null;
  /** Optional board filter. Re-fetches when changed. */
  boardType?: string;
  /** Optional layout filter. Re-fetches when changed. */
  layoutId?: number;
  /** Pool of full playlist records to intersect against the recents fallback.
   *  Without this, recents would only have uuids and couldn't render full
   *  card data. */
  candidatePlaylists: Playlist[];
  /** Override the adapter's `executeGraphQL` (used in tests). */
  executeGraphQL?: ExecutePlaylistsGraphQL;
  /** Override the adapter's recents storage (used in tests). */
  recents?: RecentsStorageAdapter;
};

export type PinnedSource = 'pinned' | 'recent' | 'empty';

export type UsePinnedPlaylistsResult = {
  pinned: Playlist[];
  source: PinnedSource;
  isLoading: boolean;
  refetch: () => void;
};

/**
 * Resolve the playlists shown in the small "Pinned" grid.
 *
 * Server-side pin state is the source of truth. When the user has not pinned
 * anything, fall back to the per-device list of recently-opened playlists,
 * intersected with whatever rows the screen has already loaded (so we have
 * full card data to render).
 *
 * Subscribes to the recents adapter's change notifier so the section refreshes
 * when the user opens a playlist elsewhere and returns to the library.
 */
export function usePinnedPlaylists({
  token,
  boardType,
  layoutId,
  candidatePlaylists,
  executeGraphQL: executeGraphQLOverride,
  recents: recentsOverride,
}: UsePinnedPlaylistsOptions): UsePinnedPlaylistsResult {
  const adapter = usePlaylistsAdapter();
  const executeGraphQL = executeGraphQLOverride ?? adapter.executeGraphQL;
  const recentsAdapter = recentsOverride ?? adapter.recents;

  const [pinned, setPinned] = useState<Playlist[]>([]);
  const [recents, setRecents] = useState<RecentPlaylistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPinned = useCallback(async () => {
    if (!token) {
      setPinned([]);
      return;
    }
    try {
      const variables: GetMyPinnedPlaylistsQueryVariables = {
        input: { boardType, layoutId },
      };
      const response = await executeGraphQL<GetMyPinnedPlaylistsQueryResponse, GetMyPinnedPlaylistsQueryVariables>(
        GET_MY_PINNED_PLAYLISTS,
        variables,
      );
      setPinned(response.myPinnedPlaylists);
    } catch (err: unknown) {
      console.error('Failed to fetch pinned playlists:', err);
      setPinned([]);
    }
  }, [token, boardType, layoutId, executeGraphQL]);

  const fetchRecents = useCallback(async () => {
    const list = await recentsAdapter.getRecentPlaylists();
    setRecents(list);
  }, [recentsAdapter]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void Promise.all([fetchPinned(), fetchRecents()]).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPinned, fetchRecents]);

  // Refresh recents when other tabs / screens record opens.
  useEffect(() => {
    const handler = () => {
      void fetchRecents();
    };
    const unsubscribe = recentsAdapter.subscribe?.(handler);
    return unsubscribe;
  }, [recentsAdapter, fetchRecents]);

  const { result, source } = useMemo<{ result: Playlist[]; source: PinnedSource }>(() => {
    if (pinned.length > 0) {
      return { result: pinned, source: 'pinned' };
    }
    if (recents.length === 0 || candidatePlaylists.length === 0) {
      return { result: [], source: 'empty' };
    }
    // Intersect recents (uuid + board metadata) with the loaded playlist rows
    // so we have full data to render. Filter by the active board filter so the
    // pinned section matches the rest of the screen.
    const byUuid = new Map(candidatePlaylists.map((playlist) => [playlist.uuid, playlist]));
    const recentMatches: Playlist[] = [];
    for (const entry of recents) {
      if (boardType && entry.boardType !== boardType) continue;
      if (layoutId != null && entry.layoutId != null && entry.layoutId !== layoutId) continue;
      const match = byUuid.get(entry.uuid);
      if (match) recentMatches.push(match);
    }
    return recentMatches.length > 0 ? { result: recentMatches, source: 'recent' } : { result: [], source: 'empty' };
  }, [pinned, recents, candidatePlaylists, boardType, layoutId]);

  return { pinned: result, source, isLoading, refetch: fetchPinned };
}
