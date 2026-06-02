// Public type surface for @boardsesh/playlists-react. Hook option/result types
// live with their hooks; this barrel re-exports them (plus the activation
// contract and adapter types) so consumers can import them from one place.

export type { ExecutePlaylistsGraphQL, PlaylistsAdapter } from './adapter';
export type { RecentPlaylistEntry, RecentsStorageAdapter } from './recents-adapter';

export type { UseDiscoverPlaylistsOptions, UseDiscoverPlaylistsResult } from './use-discover-playlists';
export type { UseUserPlaylistsOptions, UseUserPlaylistsResult } from './use-user-playlists';
export type { UsePinnedPlaylistsOptions, UsePinnedPlaylistsResult, PinnedSource } from './use-pinned-playlists';
export type { UseSmartPlaylistCountsOptions } from './use-smart-playlist-counts';
export type { UseSmartPlaylistOptions, UseSmartPlaylistResult } from './use-smart-playlist';
export type {
  UsePlaylistClimbsOptions,
  UsePlaylistClimbsResult,
  PlaylistClimbsBoardInput,
} from './use-playlist-climbs';
export type {
  UsePlaylistClimbActivationOptions,
  PlaylistActivationQueueApi,
  PlaylistActivationBoardTarget,
  FetchActivationClimbsArgs,
} from './use-playlist-climb-activation';
