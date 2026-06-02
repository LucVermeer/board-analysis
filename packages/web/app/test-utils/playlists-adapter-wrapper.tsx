import React from 'react';
import { PlaylistsAdapterProvider, noopRecentsAdapter, type PlaylistsAdapter } from '@boardsesh/playlists-react';

/**
 * Test-only wrapper that mounts a `PlaylistsAdapterProvider` with a stub
 * adapter. The shared playlist hooks call `usePlaylistsAdapter()`
 * unconditionally (it throws without a provider), but the web wrapper hooks
 * always inject their own `executeGraphQL` / `recents` overrides built from
 * `@/app/lib/graphql/client` — so the stub's transport here is never exercised
 * (it throws if it ever is, to surface a wiring regression). This lets unit
 * tests render the web wrappers/screens without standing up the real
 * token-aware provider.
 */
const stubAdapter: PlaylistsAdapter = {
  executeGraphQL: () => {
    throw new Error('Stub PlaylistsAdapter.executeGraphQL invoked — web hooks must pass an executeGraphQL override.');
  },
  recents: noopRecentsAdapter,
};

export function PlaylistsAdapterTestProvider({ children }: { children: React.ReactNode }) {
  return <PlaylistsAdapterProvider value={stubAdapter}>{children}</PlaylistsAdapterProvider>;
}
