# Playlist SSR hydration pattern

How playlist detail pages and smart (generated) playlist pages render real content on the first paint instead of a loading spinner.

## Where the pattern lives

- `packages/web/app/playlists/[playlist_uuid]/page.tsx` — global playlist route
- `packages/web/app/b/[board_slug]/[angle]/playlists/[playlist_uuid]/page.tsx` — board-scoped variant
- `packages/web/app/discover/[smart_playlist]/[user_id]/page.tsx` — smart (generated) playlist route
- `packages/web/app/playlists/[playlist_uuid]/playlist-detail-content.tsx` — shared client component
- `packages/web/app/discover/[smart_playlist]/[user_id]/smart-playlist-content.tsx` — smart client component
- `packages/web/app/lib/graphql/server-graphql.ts` — `serverPlaylist` / `serverPlaylistClimbs` / `serverSmartPlaylist`
- `packages/web/app/lib/graphql/ssr-query-seed.ts` — `ssrSeedMatchesQueryKey` helper

## What the server does

1. Fetches the playlist (or smart-playlist metadata) via `serverPlaylist` / `serverSmartPlaylist`.
2. Fetches the first page of climbs **with the same filter tuple the client will use on first render**:
   - Global route: no board filter at all.
   - Board-scoped route: `boardName`, `layoutId`, `sizeId`, `setIds`, `angle` from the matched `UserBoard`.
   - Smart route: no board filter.
3. Passes `initialPlaylist` / `initialClimbs` / `initialSmartPlaylist` as props to the client component.

The "same filter tuple" invariant is the load-bearing piece. Each backend resolver narrows by all five board fields, not just `boardName + layoutId` — so an SSR fetch that omits `sizeId`/`setIds`/`angle` returns a strict superset of what the client query would return, and seeding that payload as `initialData` puts wrong-board climbs into the cache. The board-scoped route only seeds `initialClimbs` when `findMatchingBoard(initialMyBoards, boardSlug)` resolves, because that's the only state where we can be sure the client's first query key (`selectedBoard.uuid`) lines up with the SSR fetch.

## What the client does

1. Initialises `selectedBoard` synchronously from `initialMyBoards` so the very first render is already on the right board (no "All boards" → matched-board flash).
2. Snapshots the query-key components the SSR payload was fetched for into a `useRef`. For playlist detail this is `{ boardUuid, refreshKey }`; for the smart playlist it is `{ boardUuid }`.
3. Seeds react-query's `initialData` and `initialDataUpdatedAt` only when `ssrSeedMatchesQueryKey(...)` returns `true` for the live query key vs the snapshot.
4. Suppresses the full-page spinner when the SSR payload provided enough content to render — the gate is `loading || (tokenLoading && !playlist)` rather than `loading || tokenLoading`.
5. Preserves SSR-rendered content if the first client-side refetch hits a transient error: `setError('load-failed')` is gated on `!hasPlaylistDataRef.current`.

## The two invariants you must keep

1. **The SSR fetch and the client's first query key must use the same filter tuple.** If you add a dimension to the query key (a new chip, a new mode toggle, a server-side hint), you MUST also pass that dimension into the SSR call **or** stop seeding `initialData` when the dimension differs from the SSR-fetched value.

2. **`initialData` is keyed-not-keyed in react-query.** `useInfiniteQuery({ initialData: X })` returns the same `X` for every query key — react-query only consults `initialData` when there is no existing entry for the key, but it still treats it as fresh under `staleTime` (when `initialDataUpdatedAt` is set). That means a naive `initialData: { pages: [initialClimbs], … }` will hydrate every new cache slot — board switches, post-edit `listRefreshKey` bumps, etc. — with the original SSR page and silently skip the fetch.

   Fix: snapshot the key components the SSR fetch was scoped to, and gate both `initialData` and `initialDataUpdatedAt` on the snapshot still matching the live render via `ssrSeedMatchesQueryKey`. When the gate flips false, `initialData` becomes `undefined` and react-query falls back to a real fetch for the new key.

## How to extend the pattern

If you want to SSR a new playlist-shaped surface:

1. Add a `serverXyz(authToken, input)` helper alongside the others in `server-graphql.ts`. Mirror the error-logging fallback (`console.error('serverXyz failed:', error); return null;`).
2. Re-export from `server-cached-client.ts` so existing import sites keep working.
3. In the page route, fetch in parallel with `serverMyBoards`. Only fire the climbs/items call if the parent entity resolved (avoid wasting a backend call on 404).
4. In the client component:
   - Snapshot the SSR-fetched query-key components in a `useRef` at mount.
   - Use `ssrSeedMatchesQueryKey` to gate both `initialData` and `initialDataUpdatedAt`.
   - Skip the full-page spinner when SSR content is present.

## Why each piece is there

- **`hasPlaylistDataRef`** — keeps `playlist` out of `fetchPlaylist`'s `useCallback` deps. Without it, `setPlaylist` → callback recreate → effect rerun → `setPlaylist` → infinite loop. The previous incarnation of this PR (#1794) was reverted (#2095) for exactly this bug.
- **`ssrInitialClimbsUpdatedAtRef`** — pins `initialDataUpdatedAt` to mount time. Defaulting to `0` would mark the SSR data as epoch-stale and trigger an immediate refetch on every page load.
- **`ssrClimbsKeyRef`** — captures the snapshot the `ssrSeedMatchesQueryKey` predicate compares against. A `useRef` (not `useState`) so it never changes and never re-renders the component.

## Tests

- `packages/web/app/lib/graphql/__tests__/ssr-query-seed.test.ts` — unit tests for the snapshot predicate.
- `packages/web/app/lib/graphql/__tests__/server-graphql.test.ts` — unit tests for the server helpers' happy path + error-fallback contract.
