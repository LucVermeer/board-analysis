import type { RecentPlaylistEntry, RecentsStorageAdapter } from '@boardsesh/playlists-react';
import { getRecentPlaylists, RECENT_PLAYLISTS_CHANGED_EVENT } from '@/app/lib/recent-playlists-db';

/**
 * Web implementation of the shared `RecentsStorageAdapter`, backed by
 * `recent-playlists-db` (IndexedDB) and the `RECENT_PLAYLISTS_CHANGED_EVENT`
 * window event. Shared by the root `PlaylistsAdapterProvider` and the
 * standalone `usePinnedPlaylists` web wrapper. Lives in `lib/` (no React /
 * next-auth imports) so consuming it doesn't drag the provider's client
 * component into a hook's import graph.
 */
export const webRecentsAdapter: RecentsStorageAdapter = {
  getRecentPlaylists: async (): Promise<RecentPlaylistEntry[]> => {
    const recents = await getRecentPlaylists();
    // RecentPlaylist already matches RecentPlaylistEntry structurally; map
    // explicitly so the shared contract stays the source of truth.
    return recents.map((entry) => ({
      uuid: entry.uuid,
      boardType: entry.boardType,
      layoutId: entry.layoutId,
      timestamp: entry.timestamp,
    }));
  },
  subscribe: (onChange: () => void): (() => void) => {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(RECENT_PLAYLISTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(RECENT_PLAYLISTS_CHANGED_EVENT, onChange);
  },
};
