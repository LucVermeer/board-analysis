import { useMemo } from 'react';
import {
  useUserPlaylists as useSharedUserPlaylists,
  type UseUserPlaylistsOptions as SharedUseUserPlaylistsOptions,
  type UseUserPlaylistsResult,
} from '@boardsesh/playlists-react';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';

// Public surface unchanged. `token` stays as the enable gate (the shared hook
// disables itself when token is null); it's also threaded into the transport.
export type UseUserPlaylistsOptions = Omit<SharedUseUserPlaylistsOptions, 'executeGraphQL'>;
export type { UseUserPlaylistsResult };

/**
 * Web wrapper over the shared `useUserPlaylists`. Builds a token-aware
 * `executeGraphQL` from web's `createGraphQLHttpClient` so requests carry the
 * auth header exactly as before, and so the hook runs in unit tests that mock
 * `@/app/lib/graphql/client` without the root `PlaylistsAdapterProvider`.
 */
export function useUserPlaylists(options: UseUserPlaylistsOptions): UseUserPlaylistsResult {
  const { token } = options;
  const executeUserGraphQL = useMemo<SharedUseUserPlaylistsOptions['executeGraphQL']>(
    () => (query, variables) => createGraphQLHttpClient(token).request(query, variables),
    [token],
  );
  return useSharedUserPlaylists({ ...options, executeGraphQL: executeUserGraphQL });
}
