// Per-device "recently opened playlists" store backed by AsyncStorage, mirroring
// web's `packages/web/app/lib/recent-playlists-db.ts` (IndexedDB). Feeds the
// shared `usePinnedPlaylists` recents fallback so the library's "Jump Back In"
// shows recently-opened playlists when the user hasn't pinned anything.
//
// The write (`recordPlaylistOpen`) is a direct export, not part of the shared
// `RecentsStorageAdapter` interface — same split as web, where the adapter only
// exposes reads + a change notifier and the page records opens directly.

import type { RecentPlaylistEntry, RecentsStorageAdapter } from '@boardsesh/playlists-react';
import { getPreference, setPreference } from '../preference-store';

const STORAGE_KEY = 'boardsesh:recent-playlists';
const MAX_ITEMS = 16;

// In-process listeners so the pinned hook's recents fallback refreshes when the
// user opens a playlist and navigates back. RN has no cross-tab `window` event
// (web's notifier), so a simple listener set gives the same refresh-on-return.
const listeners = new Set<() => void>();

export async function getRecentPlaylists(): Promise<RecentPlaylistEntry[]> {
  return (await getPreference<RecentPlaylistEntry[]>(STORAGE_KEY)) ?? [];
}

/**
 * Record a playlist open: dedupe by uuid (re-opening bubbles it to the front),
 * newest first, capped at MAX_ITEMS, with the timestamp stamped at write time.
 * Best-effort — failures are swallowed (matches web). Notifies subscribers on
 * a successful write.
 */
export async function recordPlaylistOpen(entry: Omit<RecentPlaylistEntry, 'timestamp'>): Promise<void> {
  try {
    const existing = await getRecentPlaylists();
    const deduped = existing.filter((recent) => recent.uuid !== entry.uuid);
    const next: RecentPlaylistEntry[] = [{ ...entry, timestamp: Date.now() }, ...deduped].slice(0, MAX_ITEMS);
    await setPreference(STORAGE_KEY, next);
    listeners.forEach((listener) => listener());
  } catch (err) {
    console.error('Failed to record playlist open:', err);
  }
}

/** Mobile recents adapter wired into the playlists adapter (replaces noop). */
export const mobileRecentsAdapter: RecentsStorageAdapter = {
  getRecentPlaylists,
  subscribe: (onChange) => {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
};
