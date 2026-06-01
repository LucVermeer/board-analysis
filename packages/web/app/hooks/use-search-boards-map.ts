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
import { zoomToRadiusKm, roundCoord } from '@boardsesh/board-config';

// Re-exported for existing importers (e.g. the hook's test). The implementation
// now lives in the shared @boardsesh/board-config package so web and mobile
// can't drift.
export { zoomToRadiusKm };

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
