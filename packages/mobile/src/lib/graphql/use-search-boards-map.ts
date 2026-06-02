// Search hook for the board-search map. Adapts the web's useSearchBoardsMap to
// mobile: derive the search radius from the map camera zoom, debounce the text
// query and the camera so pans/keystrokes don't hammer the API, and call the
// shared SEARCH_BOARDS op. The GATING mirrors web exactly — fire only when
// enabled and there are coords OR a 2+ char text query — but, unlike web's
// infinite-scroll list, this returns a single page (PAGE_LIMIT). The map shows
// the boards in the current viewport; panning/zooming refetches, so there's no
// "load more". If a result list ever needs pagination, switch to
// useInfiniteQuery like the web hook.

import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { UserBoard } from '@boardsesh/shared-schema';
import { getHttpClient } from './client';
import { SEARCH_BOARDS, type SearchBoardsQueryResponse } from './operations';
import { zoomToRadiusKm, roundCoord } from '@boardsesh/board-config';

const PAGE_LIMIT = 30;

export type SearchBoardsMapInput = {
  query: string;
  latitude: number | null;
  longitude: number | null;
  zoom: number;
  enabled: boolean;
};

export type SearchBoardsMapResult = {
  boards: UserBoard[];
  isLoading: boolean;
  isFetching: boolean;
  radiusKm: number;
};

/** Debounce a value by `delayMs` (no external dep — mobile has no shared one). */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useSearchBoardsMap({
  query,
  latitude,
  longitude,
  zoom,
  enabled,
}: SearchBoardsMapInput): SearchBoardsMapResult {
  const debouncedQuery = useDebouncedValue(query, 300);
  // Round + debounce the camera so small pans don't refire the query.
  const lat = useDebouncedValue(roundCoord(latitude), 250);
  const lon = useDebouncedValue(roundCoord(longitude), 250);
  const radiusKm = useMemo(() => zoomToRadiusKm(zoom), [zoom]);
  const debouncedRadius = useDebouncedValue(radiusKm, 250);

  const hasCoords = lat != null && lon != null;
  const trimmedQuery = debouncedQuery.trim();
  const hasQuery = trimmedQuery.length >= 2;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['searchBoardsMap', trimmedQuery, lat, lon, debouncedRadius],
    queryFn: () =>
      getHttpClient().request<SearchBoardsQueryResponse>(SEARCH_BOARDS, {
        input: {
          query: hasQuery ? trimmedQuery : undefined,
          latitude: hasCoords ? lat : undefined,
          longitude: hasCoords ? lon : undefined,
          radiusKm: hasCoords ? debouncedRadius : undefined,
          limit: PAGE_LIMIT,
        },
      }),
    select: (response) => response.searchBoards,
    enabled: enabled && (hasCoords || hasQuery),
    staleTime: 30 * 1000,
    // Keep the previous result visible while the next region's query is in
    // flight, so map markers don't blink to empty between pans.
    placeholderData: keepPreviousData,
  });

  return {
    boards: data?.boards ?? [],
    isLoading,
    isFetching,
    radiusKm,
  };
}
