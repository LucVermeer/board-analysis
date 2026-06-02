import { useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSmartPlaylist } from '@boardsesh/playlists-react';
import {
  GET_SMART_PLAYLIST,
  type SmartPlaylistType,
  type GetSmartPlaylistInput,
  type GetSmartPlaylistQueryResponse,
} from '@boardsesh/graphql/operations/playlists';
import { Text } from '../../../../src/components/Text';
import { Icon } from '../../../../src/components/Icon';
import { ActivityIndicator } from '../../../../src/components/ActivityIndicator';
import { PlaylistDetailView } from '../../../../src/components/playlist';
import { getHttpClient } from '../../../../src/lib/graphql/client';
import { usePlaylistActivation } from '../../../../src/lib/playlists/use-playlist-activation';
import { toQueueClimbs } from '../../../../src/lib/climb-types';
import { smartPlaylistByType } from '../../../../src/lib/smart-playlists';
import { useProfile } from '../../../../src/lib/graphql/hooks';
import { useAuthToken } from '../../../../src/lib/graphql/use-auth-token';
import { iosSystemColors } from '../../../../src/theme/ios-colors';

type SmartParams = {
  type: string;
};

export default function SmartPlaylistDetail() {
  const { type } = useLocalSearchParams<SmartParams>();
  const { t } = useTranslation('playlists');
  const { data: profile } = useProfile();
  const { isLoading: tokenLoading } = useAuthToken();

  const userId = profile?.id ?? '';
  const preset = smartPlaylistByType(type);
  const smartType = (preset?.type ?? type) as SmartPlaylistType;

  const { query, allClimbs, meta } = useSmartPlaylist({
    smartPlaylistType: smartType,
    userId,
    tokenLoading: tokenLoading || !userId,
  });

  // Suggestion-refresh fetcher pages the smart playlist scoped to the active
  // board name so the play-drawer swipe walks the full computed list.
  const fetchPage = useCallback(
    async ({ page, pageSize, board }: { page: number; pageSize: number; board: { boardName: string } }) => {
      const input: GetSmartPlaylistInput = {
        type: smartType,
        userId,
        boardName: board.boardName,
        page,
        pageSize,
      };
      const response = await getHttpClient().request<GetSmartPlaylistQueryResponse, { input: GetSmartPlaylistInput }>(
        GET_SMART_PLAYLIST,
        { input },
      );
      return {
        climbs: toQueueClimbs(response.smartPlaylist.climbs),
        hasMore: response.smartPlaylist.hasMore,
      };
    },
    [smartType, userId],
  );

  const activate = usePlaylistActivation({
    sourceId: `smart:${smartType}:${userId}`,
    allClimbs,
    fetchPage,
    refreshErrorMessage: 'Failed to refresh smart playlist suggestions:',
  });

  const hero = useMemo(
    () => ({
      name: preset ? t(preset.titleI18nKey) : (meta?.userName ?? ''),
      climbCount: meta?.climbCount ?? allClimbs.length,
      color: preset?.color,
      icon: preset?.icon,
      subtitle: meta?.userName,
    }),
    [preset, meta, allClimbs.length, t],
  );

  if (!preset && !query.isLoading) {
    return (
      <View style={styles.stateContainer}>
        <Icon name="error" size={48} color={iosSystemColors.systemGray4} />
        <Text variant="headline" style={styles.stateTitle}>
          {t('library.smart.notFound.title')}
        </Text>
        <Text variant="subheadline" style={styles.stateSubtitle}>
          {t('library.smart.notFound.description')}
        </Text>
      </View>
    );
  }

  if (query.isLoading && allClimbs.length === 0) {
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
      emptyMessage={t('library.smart.empty')}
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
