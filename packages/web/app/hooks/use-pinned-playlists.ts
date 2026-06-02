import { useMemo } from 'react';
import {
  usePinnedPlaylists as useSharedPinnedPlaylists,
  type UsePinnedPlaylistsOptions as SharedUsePinnedPlaylistsOptions,
  type UsePinnedPlaylistsResult,
  type PinnedSource,
} from '@boardsesh/playlists-react';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { webRecentsAdapter } from '@/app/lib/recent-playlists-adapter';

// Public surface unchanged, including the re-exported PinnedSource.
export type { PinnedSource };
export type UsePinnedPlaylistsOptions = Omit<SharedUsePinnedPlaylistsOptions, 'executeGraphQL' | 'recents'>;
export type { UsePinnedPlaylistsResult };

/**
 * Web wrapper over the shared `usePinnedPlaylists`. Injects web's token-aware
 * GraphQL transport and the IndexedDB-backed recents adapter explicitly so the
 * hook runs in unit tests that mock `@/app/lib/graphql/client` +
 * `recent-playlists-db` without the root `PlaylistsAdapterProvider`.
 */
export function usePinnedPlaylists(options: UsePinnedPlaylistsOptions): UsePinnedPlaylistsResult {
  const { token } = options;
  const executePinnedGraphQL = useMemo<SharedUsePinnedPlaylistsOptions['executeGraphQL']>(
    () => (query, variables) => createGraphQLHttpClient(token).request(query, variables),
    [token],
  );
  return useSharedPinnedPlaylists({
    ...options,
    executeGraphQL: executePinnedGraphQL,
    recents: webRecentsAdapter,
  });
}
