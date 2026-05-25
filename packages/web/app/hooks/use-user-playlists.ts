import { useCallback, useEffect, useRef, useState } from 'react';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import {
  GET_ALL_USER_PLAYLISTS,
  type GetAllUserPlaylistsQueryResponse,
  type GetAllUserPlaylistsQueryVariables,
  type Playlist,
} from '@boardsesh/graphql/operations/playlists';

type UseUserPlaylistsOptions = {
  /** Auth token (when null, the hook is disabled). */
  token: string | null;
  /** Optional board filter. Changing it resets pagination. */
  boardType?: string;
  /** Optional layout filter. Changing it resets pagination. */
  layoutId?: number;
  /** Page size for each loadMore call. Defaults to 20. */
  pageSize?: number;
  /** SSR-provided initial data. When supplied, the first page fetch is skipped. */
  initialData?: Playlist[];
  /** Whether SSR initial data exhausts the user's library. Pass the server's
   *  hasMore so the IntersectionObserver doesn't fire a redundant first
   *  network request just to learn there's nothing more. */
  initialHasMore?: boolean;
  /** Server-reported total count for the current filter. Defaults to
   *  initialData.length, but that under-reports when SSR returns one page
   *  out of many — pass the real total from the server response. */
  initialTotalCount?: number;
};

type UseUserPlaylistsResult = {
  playlists: Playlist[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  totalCount: number;
  /** True when the initial-page fetch failed. The page renders its own
   *  translated error UI on top of this signal — the hook deliberately
   *  doesn't carry a translatable message. */
  hasError: boolean;
  loadMore: () => void;
  refetch: () => void;
};

/**
 * Fetches the authenticated user's owned playlists, paginated.
 * Mirrors the offset-pattern used by usePopularBoardConfigs:
 *  - One page on mount, more pages on `loadMore`.
 *  - When `boardType` or `layoutId` changes, state resets and we re-fetch
 *    page 0 (so the BoardFilterStrip works correctly).
 *  - Three consecutive loadMore failures freeze the hook to prevent the
 *    IntersectionObserver in PlaylistScrollSection from retrying forever.
 */
export function useUserPlaylists({
  token,
  boardType,
  layoutId,
  pageSize = 20,
  initialData,
  initialHasMore,
  initialTotalCount,
}: UseUserPlaylistsOptions): UseUserPlaylistsResult {
  const hasInitialData = initialData != null;
  const [playlists, setPlaylists] = useState<Playlist[]>(hasInitialData ? initialData : []);
  const [isLoading, setIsLoading] = useState(!hasInitialData);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(hasInitialData ? (initialHasMore ?? false) : false);
  const [totalCount, setTotalCount] = useState(hasInitialData ? (initialTotalCount ?? initialData.length) : 0);
  const [hasError, setHasError] = useState(false);

  const hasMoreRef = useRef(hasMore);
  // SSR delivers page 0; the next loadMore() must request page 1, not page 0
  // again (which would duplicate the SSR rows). When there's no SSR data we
  // start at 0 and the initial-fetch effect requests it.
  const pageRef = useRef(hasInitialData ? 1 : 0);
  const isFetchingRef = useRef(false);
  const loadMoreFailCountRef = useRef(0);

  const fetchPage = useCallback(
    async (page: number, isInitial: boolean) => {
      if (!token) return;
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (isInitial) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const client = createGraphQLHttpClient(token);
        const variables: GetAllUserPlaylistsQueryVariables = {
          input: { boardType, layoutId, page, pageSize },
        };
        const response = await client.request<GetAllUserPlaylistsQueryResponse>(GET_ALL_USER_PLAYLISTS, variables);
        const { playlists: newPlaylists, totalCount: nextTotal, hasMore: more } = response.allUserPlaylists;

        setPlaylists((prev) => (isInitial ? newPlaylists : [...prev, ...newPlaylists]));
        setTotalCount(nextTotal);
        setHasMore(more);
        hasMoreRef.current = more;
        pageRef.current = page + 1;
        loadMoreFailCountRef.current = 0;
        setHasError(false);
      } catch (err) {
        console.error('Failed to fetch user playlists:', err);
        if (isInitial) {
          setHasError(true);
        } else {
          loadMoreFailCountRef.current += 1;
          if (loadMoreFailCountRef.current >= 3) {
            setHasMore(false);
            hasMoreRef.current = false;
          }
        }
      } finally {
        if (isInitial) {
          setIsLoading(false);
        } else {
          setIsLoadingMore(false);
        }
        isFetchingRef.current = false;
      }
    },
    [token, boardType, layoutId, pageSize],
  );

  // Reset + re-fetch when filters change. Skip the very first run if SSR
  // already populated initialData for the current filter.
  const skipFirstFetchRef = useRef(hasInitialData);
  useEffect(() => {
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }
    if (!token) {
      setPlaylists([]);
      setIsLoading(false);
      setHasMore(false);
      setTotalCount(0);
      hasMoreRef.current = false;
      pageRef.current = 0;
      return;
    }
    setPlaylists([]);
    pageRef.current = 0;
    void fetchPage(0, true);
  }, [fetchPage, token]);

  const loadMore = useCallback(() => {
    if (hasMoreRef.current && !isFetchingRef.current) {
      void fetchPage(pageRef.current, false);
    }
  }, [fetchPage]);

  const refetch = useCallback(() => {
    pageRef.current = 0;
    void fetchPage(0, true);
  }, [fetchPage]);

  return { playlists, isLoading, isLoadingMore, hasMore, totalCount, hasError, loadMore, refetch };
}
