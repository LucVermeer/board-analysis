/**
 * Per-device "recently opened playlists" storage, abstracted so the shared
 * pinned-playlists hook stays free of web-only IndexedDB and `window` event
 * APIs. Web wires this to `recent-playlists-db` (IndexedDB + a
 * `window`-dispatched change event); mobile can back it with SQLite / async
 * storage and a subscription, or skip it entirely with `noopRecentsAdapter`.
 */

/**
 * A single recently-opened playlist entry. Mirrors the web
 * `RecentPlaylist` shape so the IndexedDB store satisfies it structurally.
 */
export type RecentPlaylistEntry = {
  uuid: string;
  boardType: string;
  layoutId: number | null;
  timestamp: number;
};

export type RecentsStorageAdapter = {
  /** Return the device's recently-opened playlists, newest first. */
  getRecentPlaylists: () => Promise<RecentPlaylistEntry[]>;
  /**
   * Optional change notifier. When provided, the pinned hook subscribes and
   * re-reads recents whenever it fires (e.g. the user opens a playlist in
   * another tab). Must return an unsubscribe function. Web wires a
   * `window` event listener; platforms without one can omit it.
   */
  subscribe?: (onChange: () => void) => () => void;
};

/** Recents storage that always returns nothing — for platforms without it. */
export const noopRecentsAdapter: RecentsStorageAdapter = {
  getRecentPlaylists: async () => [],
};
