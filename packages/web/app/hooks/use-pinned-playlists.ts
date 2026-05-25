import { useCallback, useEffect, useMemo, useState } from 'react';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import {
  GET_MY_PINNED_PLAYLISTS,
  type GetMyPinnedPlaylistsQueryResponse,
  type GetMyPinnedPlaylistsQueryVariables,
  type Playlist,
} from '@boardsesh/graphql/operations/playlists';
import { getRecentPlaylists, RECENT_PLAYLISTS_CHANGED_EVENT, type RecentPlaylist } from '@/app/lib/recent-playlists-db';

type UsePinnedPlaylistsOptions = {
  /** Auth token (when null, server-side pinned is skipped). */
  token: string | null;
  /** Optional board filter. Re-fetches when changed. */
  boardType?: string;
  /** Optional layout filter. Re-fetches when changed. */
  layoutId?: number;
  /** Pool of full playlist records to intersect against the IndexedDB recents
   *  fallback. Without this, recents would only have uuids and couldn't
   *  render full PlaylistCard data. */
  candidatePlaylists: Playlist[];
};

export type PinnedSource = 'pinned' | 'recent' | 'empty';

type UsePinnedPlaylistsResult = {
  pinned: Playlist[];
  source: PinnedSource;
  isLoading: boolean;
  refetch: () => void;
};

/**
 * Resolve the playlists shown in the small "Pinned" grid on /playlists.
 *
 * Server-side pin state (Postgres) is the source of truth. When the user has
 * not pinned anything, fall back to the per-device IndexedDB list of
 * recently-opened playlists, intersected with whatever rows the page has
 * already loaded (so we have full PlaylistCard data to render).
 *
 * Listens for the recent-playlists changed event so the section refreshes
 * when the user opens a playlist in another tab and returns to the library.
 */
export function usePinnedPlaylists({
  token,
  boardType,
  layoutId,
  candidatePlaylists,
}: UsePinnedPlaylistsOptions): UsePinnedPlaylistsResult {
  const [pinned, setPinned] = useState<Playlist[]>([]);
  const [recents, setRecents] = useState<RecentPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPinned = useCallback(async () => {
    if (!token) {
      setPinned([]);
      return;
    }
    try {
      const client = createGraphQLHttpClient(token);
      const variables: GetMyPinnedPlaylistsQueryVariables = {
        input: { boardType, layoutId },
      };
      const response = await client.request<GetMyPinnedPlaylistsQueryResponse>(GET_MY_PINNED_PLAYLISTS, variables);
      setPinned(response.myPinnedPlaylists);
    } catch (err) {
      console.error('Failed to fetch pinned playlists:', err);
      setPinned([]);
    }
  }, [token, boardType, layoutId]);

  const fetchRecents = useCallback(async () => {
    const list = await getRecentPlaylists();
    setRecents(list);
  }, []);

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

  // Refresh recents when other tabs / pages record opens.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      void fetchRecents();
    };
    window.addEventListener(RECENT_PLAYLISTS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(RECENT_PLAYLISTS_CHANGED_EVENT, handler);
  }, [fetchRecents]);

  const { result, source } = useMemo<{ result: Playlist[]; source: PinnedSource }>(() => {
    if (pinned.length > 0) {
      return { result: pinned, source: 'pinned' };
    }
    if (recents.length === 0 || candidatePlaylists.length === 0) {
      return { result: [], source: 'empty' };
    }
    // Intersect IndexedDB recents (uuid + board metadata) with the loaded
    // playlist rows so we have full data to render. Filter by the active
    // board filter so the pinned section matches the rest of the page.
    const byUuid = new Map(candidatePlaylists.map((p) => [p.uuid, p]));
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
