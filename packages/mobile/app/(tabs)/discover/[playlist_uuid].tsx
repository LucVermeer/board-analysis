import { useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usePlaylistClimbs } from '@boardsesh/playlists-react';
import {
  GET_PLAYLIST,
  GET_PLAYLIST_CLIMBS,
  type GetPlaylistQueryResponse,
  type GetPlaylistQueryVariables,
  type GetPlaylistClimbsInput,
  type GetPlaylistClimbsQueryResponse,
} from '@boardsesh/graphql/operations/playlists';
import { Text } from '../../../src/components/Text';
import { Icon } from '../../../src/components/Icon';
import { ActivityIndicator } from '../../../src/components/ActivityIndicator';
import { PlaylistDetailView } from '../../../src/components/playlist';
import { getHttpClient } from '../../../src/lib/graphql/client';
import { usePlaylistActivation } from '../../../src/lib/playlists/use-playlist-activation';
import { toQueueClimbs } from '../../../src/lib/climb-types';
import { iosSystemColors } from '../../../src/theme/ios-colors';

type DetailParams = {
  playlist_uuid: string;
};

export default function PlaylistDetail() {
  const { playlist_uuid: playlistUuid } = useLocalSearchParams<DetailParams>();
  const { t } = useTranslation('playlists');

  // Playlist metadata for the hero (name, climb count, colour, icon).
  const { data: playlist, isLoading: metaLoading } = useQuery({
    queryKey: ['playlist', playlistUuid],
    queryFn: async () => {
      const response = await getHttpClient().request<GetPlaylistQueryResponse, GetPlaylistQueryVariables>(
        GET_PLAYLIST,
        {
          playlistId: playlistUuid,
        },
      );
      return response.playlist;
    },
    enabled: !!playlistUuid,
  });

  const { query, allClimbs } = usePlaylistClimbs({ playlistUuid });

  // Suggestion-refresh fetcher: pages the same playlist scoped to the active
  // board so the play-drawer swipe walks the whole playlist on that board.
  const fetchPage = useCallback(
    async ({
      page,
      pageSize,
      board,
    }: {
      page: number;
      pageSize: number;
      board: { boardName: string; layoutId: number; sizeId: number; setIds: string; angle: number };
    }) => {
      const input: GetPlaylistClimbsInput = {
        playlistId: playlistUuid,
        boardName: board.boardName,
        layoutId: board.layoutId,
        sizeId: board.sizeId,
        setIds: board.setIds,
        angle: board.angle,
        page,
        pageSize,
      };
      const response = await getHttpClient().request<GetPlaylistClimbsQueryResponse, { input: GetPlaylistClimbsInput }>(
        GET_PLAYLIST_CLIMBS,
        { input },
      );
      return {
        climbs: toQueueClimbs(response.playlistClimbs.climbs),
        hasMore: response.playlistClimbs.hasMore,
      };
    },
    [playlistUuid],
  );

  const activate = usePlaylistActivation({
    sourceId: `playlist:${playlistUuid}`,
    allClimbs,
    fetchPage,
    refreshErrorMessage: 'Failed to refresh playlist suggestions:',
  });

  const hero = useMemo(
    () => ({
      name: playlist?.name ?? t('metadata.detail.fallbackTitle'),
      climbCount: playlist?.climbCount ?? allClimbs.length,
      color: playlist?.color,
      icon: playlist?.icon,
    }),
    [playlist, allClimbs.length, t],
  );

  // Playlist not found (resolved, null) — distinct from still-loading.
  if (!metaLoading && playlist === null) {
    return (
      <View style={styles.stateContainer}>
        <Icon name="error" size={48} color={iosSystemColors.systemGray4} />
        <Text variant="headline" style={styles.stateTitle}>
          {t('detail.errors.notFoundTitle')}
        </Text>
        <Text variant="subheadline" style={styles.stateSubtitle}>
          {t('detail.errors.notFoundDescription')}
        </Text>
      </View>
    );
  }

  if (metaLoading && allClimbs.length === 0) {
    return (
      <View style={styles.stateContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <PlaylistDetailView
      hero={hero}
      climbs={allClimbs}
      isLoading={query.isLoading}
      isFetchingNextPage={query.isFetchingNextPage}
      hasNextPage={query.hasNextPage ?? false}
      fetchNextPage={query.fetchNextPage}
      onActivateClimb={activate}
      emptyMessage={t('detail.empty')}
    />
  );
}

const styles = StyleSheet.create({
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  stateTitle: {
    marginTop: 12,
    opacity: 0.6,
  },
  stateSubtitle: {
    opacity: 0.4,
    textAlign: 'center',
  },
});
