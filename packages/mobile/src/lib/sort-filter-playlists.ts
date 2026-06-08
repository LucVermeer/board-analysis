import type { Playlist } from '@boardsesh/graphql/operations/playlists';

/**
 * Sort playlists alphabetically by name (case- and accent-insensitive), then
 * keep only those whose name contains the (trimmed, case-insensitive) query.
 * Pure so the "My Playlists" screen can test ordering + filtering without a
 * render. Does not mutate the input.
 */
export function sortAndFilterPlaylists(playlists: Playlist[], query: string): Playlist[] {
  const sorted = [...playlists].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const needle = query.trim().toLowerCase();
  if (!needle) return sorted;
  return sorted.filter((playlist) => playlist.name.toLowerCase().includes(needle));
}
