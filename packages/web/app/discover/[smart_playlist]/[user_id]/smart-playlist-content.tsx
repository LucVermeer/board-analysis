'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import MuiButton from '@mui/material/Button';
import { IosShare, SentimentDissatisfiedOutlined } from '@mui/icons-material';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Climb } from '@/app/lib/types';
import type { UserBoard } from '@boardsesh/shared-schema';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import {
  type GetSmartPlaylistInput,
  type GetSmartPlaylistQueryResponse,
  type GetSmartPlaylistQueryVariables,
  type SmartPlaylistMeta,
  type SmartPlaylistResult,
  type SmartPlaylistType,
  GET_SMART_PLAYLIST,
} from '@/app/lib/graphql/operations/playlists';
import { type SmartPlaylistSlug, smartPlaylistByType } from '@/app/lib/smart-playlists';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import { useMyBoards } from '@/app/hooks/use-my-boards';
import { findMatchingBoard } from '@/app/lib/find-matching-board';
import { ssrSeedMatchesQueryKey } from '@/app/lib/graphql/ssr-query-seed';
import { shareWithFallback } from '@/app/lib/share-utils';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { EmptyState } from '@/app/components/ui/empty-state';
import PlaylistPreviewSquare from '@/app/components/library/playlist-preview-square';
import MultiboardClimbList from '@/app/components/climb-list/multiboard-climb-list';
import BackButton from '@/app/components/back-button';
import LocaleLink from '@/app/components/i18n/locale-link';
import styles from '@/app/components/library/playlist-view.module.css';

type Props = {
  smartPlaylistType: SmartPlaylistType;
  smartPlaylistSlug: SmartPlaylistSlug;
  userId: string;
  initialMyBoards?: UserBoard[] | null;
  /** SSR-fetched first page so the hero + climbs paint without a spinner. */
  initialSmartPlaylist?: SmartPlaylistResult | null;
};

export default function SmartPlaylistContent({
  smartPlaylistType,
  smartPlaylistSlug,
  userId,
  initialMyBoards,
  initialSmartPlaylist,
}: Props) {
  const { t } = useTranslation('playlists');
  const { showMessage } = useSnackbar();
  const { token, isLoading: tokenLoading } = useWsAuthToken();
  const preset = smartPlaylistByType(smartPlaylistType);

  const [selectedBoard, setSelectedBoard] = useState<UserBoard | null>(() => findMatchingBoard(initialMyBoards));
  const { boards: myBoards, isLoading: boardsLoading } = useMyBoards(true, 50, initialMyBoards);
  // Mark SSR data fresh so react-query honours staleTime instead of triggering
  // an immediate refetch (initialDataUpdatedAt defaults to 0 = epoch).
  const ssrInitialUpdatedAtRef = useRef(initialSmartPlaylist ? Date.now() : 0);
  // Snapshot the key the SSR payload was fetched for. Without this gate, the
  // same initialData would be reused for every board-chip switch (and any
  // future key changes) instead of triggering a real fetch.
  const ssrSmartKeyRef = useRef({ boardUuid: selectedBoard?.uuid ?? null });

  const {
    data: pagedData,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['smartPlaylist', smartPlaylistType, userId, selectedBoard?.uuid ?? 'all'],
    queryFn: async ({ pageParam }) => {
      const client = createGraphQLHttpClient(token);
      const input: GetSmartPlaylistInput = {
        type: smartPlaylistType,
        userId,
        page: pageParam,
        pageSize: 20,
        ...(selectedBoard && { boardName: selectedBoard.boardType }),
      };
      const response = await client.request<GetSmartPlaylistQueryResponse>(GET_SMART_PLAYLIST, {
        input,
      } satisfies GetSmartPlaylistQueryVariables);
      return response.smartPlaylist;
    },
    enabled: !tokenLoading,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length : undefined),
    staleTime: 5 * 60 * 1000,
    // Only seed when the current query key still matches the tuple the SSR
    // payload was fetched for. Beyond the obvious first-render case this
    // also avoids re-applying stale SSR data if the user switches away from
    // and back to the default view much later.
    initialData:
      initialSmartPlaylist &&
      ssrSeedMatchesQueryKey(true, ssrSmartKeyRef.current, { boardUuid: selectedBoard?.uuid ?? null })
        ? {
            pages: [initialSmartPlaylist],
            pageParams: [0],
          }
        : undefined,
    initialDataUpdatedAt: ssrSeedMatchesQueryKey(!!initialSmartPlaylist, ssrSmartKeyRef.current, {
      boardUuid: selectedBoard?.uuid ?? null,
    })
      ? ssrInitialUpdatedAtRef.current
      : 0,
  });

  const allClimbs: Climb[] = useMemo(
    () => pagedData?.pages.flatMap((page) => page.climbs as Climb[]) ?? [],
    [pagedData],
  );

  const meta: SmartPlaylistMeta | undefined = pagedData?.pages[0]?.meta ?? initialSmartPlaylist?.meta;

  const boardTypes = useMemo(() => {
    const types = new Set<string>();
    for (const climb of allClimbs) {
      if (climb.boardType) types.add(climb.boardType);
    }
    return Array.from(types);
  }, [allClimbs]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/discover/${smartPlaylistSlug}/${encodeURIComponent(userId)}`;
    await shareWithFallback({
      url,
      title: t(preset.titleI18nKey),
      text: meta ? t('library.smart.shareText', { name: meta.userName }) : t(preset.titleI18nKey),
      trackingEvent: 'Smart Playlist Shared',
      trackingProps: { smartPlaylistType, userId },
      onClipboardSuccess: () => showMessage(t('detail.shareSuccess'), 'success'),
      onError: () => showMessage(t('detail.shareError'), 'error'),
    });
  }, [smartPlaylistSlug, smartPlaylistType, userId, t, meta, preset.titleI18nKey, showMessage]);

  // With SSR data we have meta + first page; skip the full-page spinner.
  // Only gate on tokenLoading when we don't have SSR-seeded content yet.
  if ((tokenLoading || isLoading) && !meta) {
    return (
      <div className={styles.loadingContainer}>
        <LoadingSpinner size={48} />
      </div>
    );
  }

  if (isError || !meta) {
    return (
      <div className={styles.errorContainer}>
        <SentimentDissatisfiedOutlined className={styles.errorIcon} />
        <div className={styles.errorTitle}>{t('detail.errors.loadTitle')}</div>
        <div className={styles.errorMessage}>{t('detail.errors.loadDescription')}</div>
        <MuiButton variant="outlined" onClick={() => void refetch()}>
          {t('detail.errors.tryAgain')}
        </MuiButton>
      </div>
    );
  }

  return (
    <>
      <div className={styles.actionsSection}>
        <BackButton fallbackUrl="/playlists" />
      </div>

      <div className={styles.contentWrapper}>
        <div className={styles.heroSection}>
          <div className={styles.heroContent}>
            <div className={styles.heroSquare}>
              <PlaylistPreviewSquare
                boardType={selectedBoard?.boardType ?? 'kilter'}
                layoutId={selectedBoard?.layoutId ?? null}
                color={preset.color}
                icon={preset.icon}
              />
            </div>
            <div className={styles.heroInfo}>
              <Typography variant="h5" component="h1" className={`${styles.heroName} ${styles.heroNameWithShare}`}>
                {t(preset.titleI18nKey)}
              </Typography>
              <div className={styles.heroMeta}>
                <span className={styles.heroMetaItem}>{t('detail.climbCount', { count: meta.climbCount })}</span>
                <span className={styles.heroMetaItem}>
                  <LocaleLink href={`/profile/${meta.userId}`}>{meta.userName}</LocaleLink>
                </span>
              </div>
              <Typography variant="body2" className={styles.heroDescription}>
                {t(preset.descriptionI18nKey)}
              </Typography>
            </div>
          </div>

          <div className={styles.heroActions}>
            <IconButton onClick={handleShare} aria-label={t('detail.share')}>
              <IosShare />
            </IconButton>
          </div>
        </div>

        <div className={styles.climbsSection}>
          {allClimbs.length === 0 && !isFetching ? (
            <EmptyState description={t('library.smart.empty')} />
          ) : (
            <MultiboardClimbList
              climbs={allClimbs}
              isFetching={isFetching}
              isLoading={isLoading}
              hasMore={hasNextPage ?? false}
              onLoadMore={handleLoadMore}
              showBoardFilter
              boardTypes={boardTypes}
              selectedBoard={selectedBoard}
              onBoardSelect={setSelectedBoard}
              boards={myBoards}
              boardsLoading={boardsLoading}
            />
          )}
        </div>
      </div>
    </>
  );
}
