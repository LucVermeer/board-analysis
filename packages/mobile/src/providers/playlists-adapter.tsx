// Mobile-side wiring for `@boardsesh/playlists-react`. Mirrors `board-adapter.tsx`:
// forwards every playlist GraphQL operation through mobile's authenticated HTTP
// client (`authenticatedFetch` attaches the bearer token), and uses the no-op
// recents adapter — mobile has no per-device "recently opened playlists" store
// yet, so the pinned hook falls back to server-side pins only.
//
// Mounted in `app/_layout.tsx` inside QueryProvider (the data hooks use
// react-query) and near BoardAdapterWrapper / DrawerHostProvider.

import { useMemo, type ReactNode } from 'react';
import { PlaylistsAdapterProvider, noopRecentsAdapter, type PlaylistsAdapter } from '@boardsesh/playlists-react';
import { getHttpClient } from '../lib/graphql/client';

export function PlaylistsAdapterWrapper({ children }: { children: ReactNode }) {
  const adapter = useMemo<PlaylistsAdapter>(
    () => ({
      executeGraphQL: (query, variables) => getHttpClient().request(query, variables),
      recents: noopRecentsAdapter,
    }),
    [],
  );

  return <PlaylistsAdapterProvider value={adapter}>{children}</PlaylistsAdapterProvider>;
}
