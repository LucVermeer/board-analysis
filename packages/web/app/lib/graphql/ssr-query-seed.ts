/**
 * Returns true when the SSR-seeded payload is still valid for the live
 * react-query key — i.e. every key component the SSR fetch was scoped to
 * still matches the current render.
 *
 * Background: when a server component hands a client an SSR payload via
 * `initialData`, react-query will treat it as fresh under `staleTime`
 * (provided `initialDataUpdatedAt` is set). That payload is fetched for
 * ONE specific query-key tuple — a particular board filter, a particular
 * refresh-key, etc. If the live key drifts away from that tuple (the user
 * picks a board chip, an edit bumps a refresh-key, …) and we keep returning
 * the same `initialData`, react-query will quietly hydrate the new cache
 * slot with data that was never fetched for that key.
 *
 * The fix is to snapshot the key components the SSR fetch was scoped to
 * (capture them in a `useRef` at mount), then gate `initialData` /
 * `initialDataUpdatedAt` on this predicate.
 *
 * @param hasPayload   Whether SSR provided a payload at all.
 * @param snapshot     Key components captured at mount (matches the SSR fetch).
 * @param current      Key components on the current render.
 */
export function ssrSeedMatchesQueryKey<K extends Record<string, string | number | null>>(
  hasPayload: boolean,
  snapshot: K,
  current: K,
): boolean {
  if (!hasPayload) return false;
  for (const key of Object.keys(snapshot) as Array<keyof K>) {
    if (snapshot[key] !== current[key]) return false;
  }
  return true;
}
