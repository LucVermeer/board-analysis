'use client';

import { useMemo } from 'react';
import { useInfiniteQuery, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import { useDebouncedValue } from '@/app/hooks/use-debounced-value';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import {
  SEARCH_BOARDS,
  type SearchBoardsQueryResponse,
  type SearchBoardsQueryVariables,
} from '@boardsesh/graphql/operations';
import type { UserBoard, UserBoardConnection } from '@boardsesh/shared-schema';

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
  hasMore: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  radiusKm: number;
};

const PAGE_LIMIT = 30;

/**
 * Map zoom level → search radius in km.
 * Roughly tracks the visible radius at common Leaflet zoom levels on a typical
 * mobile/desktop viewport. Capped at 300 km so a fully-zoomed-out view doesn't
 * fire a planet-wide query.
 */
export function zoomToRadiusKm(zoom: number): number {
  if (zoom >= 14) return 5;
  if (zoom === 13) return 10;
  if (zoom === 12) return 15;
  if (zoom === 11) return 20;
  if (zoom === 10) return 40;
  if (zoom === 9) return 80;
  if (zoom === 8) return 160;
  return 300;
}

/**
 * Round coordinates to ~1km precision so small map pans don't refire the query.
 * 2 decimals ≈ 1.1 km at the equator.
 */
function roundCoord(n: number | null): number | null {
  if (n == null) return null;
  return Math.round(n * 100) / 100;
}

export function useSearchBoardsMap({
  query,
  latitude,
  longitude,
  zoom,
  enabled,
}: SearchBoardsMapInput): SearchBoardsMapResult {
  const { token } = useWsAuthToken();
  const debouncedQuery = useDebouncedValue(query, 300);
  const radiusKm = useMemo(() => zoomToRadiusKm(zoom), [zoom]);
  const lat = roundCoord(latitude);
  const lon = roundCoord(longitude);

  const hasCoords = lat != null && lon != null;
  const hasQuery = debouncedQuery.trim().length >= 2;
  const queryEnabled = enabled && (hasCoords || hasQuery);

  // Construct a single GraphQL client per token; reused across every page
  // fetch. Without this we'd allocate a new client object on every queryFn
  // invocation (every page, every refetch) for no benefit.
  const client = useMemo(() => createGraphQLHttpClient(token ?? undefined), [token]);

  const { data, isLoading, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<
    UserBoardConnection,
    Error,
    InfiniteData<UserBoardConnection>,
    QueryKey,
    number
  >({
    queryKey: ['searchBoardsMap', debouncedQuery, lat, lon, radiusKm, token],
    queryFn: async ({ pageParam }) => {
      const input: SearchBoardsQueryVariables['input'] = {
        query: hasQuery ? debouncedQuery.trim() : undefined,
        latitude: hasCoords ? lat : undefined,
        longitude: hasCoords ? lon : undefined,
        radiusKm: hasCoords ? radiusKm : undefined,
        limit: PAGE_LIMIT,
        offset: pageParam,
      };
      const response = await client.request<SearchBoardsQueryResponse, SearchBoardsQueryVariables>(SEARCH_BOARDS, {
        input,
      });
      return response.searchBoards;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.hasMore) return undefined;
      return lastPageParam + lastPage.boards.length;
    },
    enabled: queryEnabled,
    staleTime: 30 * 1000,
  });

  const boards = useMemo<UserBoard[]>(() => data?.pages.flatMap((p) => p.boards) ?? [], [data]);

  return {
    boards,
    isLoading,
    isFetching,
    hasMore: hasNextPage ?? false,
    isFetchingNextPage,
    fetchNextPage,
    radiusKm,
  };
}
