import { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { BoardName } from '@boardsesh/shared-schema';
import type { Climb } from '@boardsesh/queue';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ActivityIndicator } from '../ActivityIndicator';
import { ClimbListRow } from '../ClimbListRow';
import { PlaylistPreviewSquare } from './PlaylistPreviewSquare';
import { toQueueClimb, toSchemaClimb } from '../../lib/climb-types';
import { BAR_CONTENT_HEIGHT, TAB_BAR_HEIGHT } from '../queue-control/persistent-queue-bar';
import { useDrawerHost } from '../../providers/drawer-host-provider';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

const HERO_SQUARE = 88;

export type PlaylistDetailHero = {
  name: string;
  climbCount: number;
  color?: string;
  icon?: string;
  /** Secondary line under the climb count (e.g. the smart-playlist creator). */
  subtitle?: string;
  /** Already-translated follower-count line (public playlists). */
  followerLabel?: string;
  /** Board for the optional frosted board backdrop behind the hero square. */
  boardType?: string;
  layoutId?: number | null;
  showBoardBackdrop?: boolean;
};

export type PlaylistDetailViewProps = {
  hero: PlaylistDetailHero;
  climbs: Climb[];
  /** True while the first page loads (hero still renders; list shows a spinner). */
  isLoading: boolean;
  /** True while a subsequent page loads (trailing spinner). */
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  /** Activate a tapped climb (wires the queue + opens the play drawer). */
  onActivateClimb: (climb: Climb) => void;
  /** Already-resolved empty-list copy (callers translate with a static key). */
  emptyMessage: string;
};

/**
 * Shared hero + paginated climb list for the playlist-detail and
 * smart-playlist-detail screens. Renders the colour/emoji hero, then a FlashList
 * of `ClimbListRow`s bound to the user's active board, paginating via
 * `fetchNextPage` as the list nears its end.
 */
export function PlaylistDetailView({
  hero,
  climbs,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  onActivateClimb,
  emptyMessage,
}: PlaylistDetailViewProps) {
  const { t } = useTranslation('playlists');
  const { boardConfig } = useDrawerHost();
  const insets = useSafeAreaInsets();
  // Reserve room for the floating queue bar + tab bar so the last row isn't
  // hidden behind them (matches the boards list).
  const listPaddingBottom = BAR_CONTENT_HEIGHT + TAB_BAR_HEIGHT + insets.bottom;

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: Climb }) => {
      if (!boardConfig) return null;
      return (
        <ClimbListRow
          climb={toSchemaClimb(item)}
          boardName={boardConfig.boardName as BoardName}
          layoutId={boardConfig.layoutId}
          sizeId={boardConfig.sizeId}
          setIds={boardConfig.setIds}
          angle={boardConfig.angle}
          onPress={(tapped) => onActivateClimb(toQueueClimb(tapped))}
        />
      );
    },
    [boardConfig, onActivateClimb],
  );

  const header = (
    <View style={styles.hero}>
      <PlaylistPreviewSquare
        color={hero.color}
        icon={hero.icon}
        size={HERO_SQUARE}
        boardType={hero.boardType}
        layoutId={hero.layoutId}
        showBoardBackdrop={hero.showBoardBackdrop}
      />
      <View style={styles.heroText}>
        <Text variant="title3" numberOfLines={2} style={styles.heroName}>
          {hero.name}
        </Text>
        <Text variant="subheadline" style={styles.heroMeta}>
          {t('detail.climbCount', { count: hero.climbCount })}
        </Text>
        {hero.followerLabel ? (
          <Text variant="footnote" style={styles.heroMeta}>
            {hero.followerLabel}
          </Text>
        ) : null}
        {hero.subtitle ? (
          <Text variant="footnote" numberOfLines={1} style={styles.heroSubtitle}>
            {hero.subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlashList
        data={climbs}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: listPaddingBottom }}
        ListHeaderComponent={header}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="large" />
            </View>
          ) : (
            <View style={styles.stateContainer}>
              <Icon name="playlist" size={44} color={iosSystemColors.systemGray4} />
              <Text variant="subheadline" style={styles.emptyText}>
                {emptyMessage}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

function keyExtractor(item: Climb) {
  return item.uuid;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[5],
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroName: {
    fontWeight: '700',
  },
  heroMeta: {
    opacity: 0.6,
  },
  heroSubtitle: {
    opacity: 0.5,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyText: {
    opacity: 0.5,
    textAlign: 'center',
  },
});
