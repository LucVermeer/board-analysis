import { useMemo } from 'react';
import {
  useDiscoverPlaylists as useSharedDiscoverPlaylists,
  type UseDiscoverPlaylistsOptions as SharedUseDiscoverPlaylistsOptions,
  type UseDiscoverPlaylistsResult,
} from '@boardsesh/playlists-react';
import { executeGraphQL } from '@/app/lib/graphql/client';

// Public surface unchanged: the web hook owns its own option/result type names
// so importers (and tests) don't churn. Discover playlists are public, so the
// transport carries no auth token.
export type UseDiscoverPlaylistsOptions = Omit<SharedUseDiscoverPlaylistsOptions, 'executeGraphQL'>;
export type { UseDiscoverPlaylistsResult };

/**
 * Web wrapper over the shared `useDiscoverPlaylists`. Injects web's
 * `executeGraphQL` transport explicitly (no token — Discover is public) so the
 * hook works in unit tests that render it without the root
 * `PlaylistsAdapterProvider` and mock `@/app/lib/graphql/client`.
 */
export function useDiscoverPlaylists(options: UseDiscoverPlaylistsOptions): UseDiscoverPlaylistsResult {
  const executeDiscoverGraphQL = useMemo<SharedUseDiscoverPlaylistsOptions['executeGraphQL']>(
    () => (query, variables) => executeGraphQL(query, variables),
    [],
  );
  return useSharedDiscoverPlaylists({ ...options, executeGraphQL: executeDiscoverGraphQL });
}
