'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import BoardCard from '@/app/components/board-entity/board-card';
import BoardDetail from '@/app/components/board-entity/board-detail';
import FollowButton from '@/app/components/ui/follow-button';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import {
  SEARCH_BOARDS,
  FOLLOW_BOARD,
  UNFOLLOW_BOARD,
  type SearchBoardsQueryVariables,
  type SearchBoardsQueryResponse,
} from '@boardsesh/graphql/operations';
import type { UserBoard, UserBoardConnection } from '@boardsesh/shared-schema';
import { useDebouncedValue } from '@/app/hooks/use-debounced-value';
import { useInfiniteScroll } from '@/app/hooks/use-infinite-scroll';

type BoardSearchResultsProps = {
  query: string;
  authToken: string | null;
  /** Show a follow button on each board card. */
  showFollowButton?: boolean;
  /** Called when a board is selected (instead of opening internal BoardDetail drawer). */
  onBoardSelect?: (board: UserBoard) => void;
};

export default function BoardSearchResults({
  query,
  authToken,
  showFollowButton,
  onBoardSelect,
}: BoardSearchResultsProps) {
  const { t } = useTranslation('feed');
  const [selectedBoardUuid, setSelectedBoardUuid] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 300);
  const queryClient = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery<
    UserBoardConnection,
    Error
  >({
    queryKey: ['searchBoards', debouncedQuery, authToken],
    queryFn: async ({ pageParam }) => {
      const client = createGraphQLHttpClient(authToken);
      const response = await client.request<SearchBoardsQueryResponse, SearchBoardsQueryVariables>(SEARCH_BOARDS, {
        input: { query: debouncedQuery, limit: 20, offset: pageParam as number },
      });
      return response.searchBoards;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.hasMore) return undefined;
      return (lastPageParam as number) + lastPage.boards.length;
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
  });

  const results: UserBoard[] = useMemo(() => data?.pages.flatMap((p) => p.boards) ?? [], [data]);

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: fetchNextPage,
    hasMore: hasNextPage ?? false,
    isFetching: isFetchingNextPage,
  });

  const handleFollowChange = useCallback(
    (boardUuid: string, isFollowing: boolean) => {
      queryClient.setQueryData<InfiniteData<UserBoardConnection>>(
        ['searchBoards', debouncedQuery, authToken],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              boards: page.boards.map((b) =>
                b.uuid === boardUuid
                  ? {
                      ...b,
                      isFollowedByMe: isFollowing,
                      followerCount: b.followerCount + (isFollowing ? 1 : -1),
                    }
                  : b,
              ),
            })),
          };
        },
      );
    },
    [queryClient, debouncedQuery, authToken],
  );

  const handleBoardClick = useCallback(
    (board: UserBoard) => {
      if (onBoardSelect) {
        onBoardSelect(board);
      } else {
        setSelectedBoardUuid(board.uuid);
      }
    },
    [onBoardSelect],
  );

  if (query.length < 2) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('search.minCharsHint')}
        </Typography>
      </Box>
    );
  }

  if (isLoading && results.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isLoading && results.length === 0 && debouncedQuery.length >= 2) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('search.noBoards', { query: debouncedQuery })}
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Stack spacing={1.5} sx={{ px: 2, py: 1 }}>
        {results.map((board) => (
          <BoardCard
            key={board.uuid}
            board={board}
            onClick={handleBoardClick}
            trailingAction={
              showFollowButton ? (
                <FollowButton
                  entityId={board.uuid}
                  initialIsFollowing={board.isFollowedByMe}
                  followMutation={FOLLOW_BOARD}
                  unfollowMutation={UNFOLLOW_BOARD}
                  entityLabel="board"
                  getFollowVariables={(id) => ({ input: { boardUuid: id } })}
                  onFollowChange={(isFollowing) => handleFollowChange(board.uuid, isFollowing)}
                />
              ) : undefined
            }
          />
        ))}
      </Stack>
      <Box ref={sentinelRef} sx={{ display: 'flex', justifyContent: 'center', py: 2, minHeight: 20 }}>
        {isFetchingNextPage && <CircularProgress size={24} />}
      </Box>
      {!onBoardSelect && (
        <BoardDetail
          boardUuid={selectedBoardUuid ?? ''}
          open={!!selectedBoardUuid}
          onClose={() => setSelectedBoardUuid(null)}
          anchor="top"
        />
      )}
    </>
  );
}
