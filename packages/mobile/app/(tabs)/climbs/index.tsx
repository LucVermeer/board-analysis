import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation, useRouter } from 'expo-router';
import ContextMenu from 'react-native-context-menu-view';
import { useTranslation } from 'react-i18next';
import type { Climb } from '@boardsesh/shared-schema';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants';
import { ClimbListRow } from '../../../src/components/ClimbListRow';
import { ActivityIndicator } from '../../../src/components/ActivityIndicator';
import { Text } from '../../../src/components/Text';
import { Icon } from '../../../src/components/Icon';
import { useDefaultBoard, useSearchClimbs } from '../../../src/lib/graphql/hooks';
import { hapticSelection } from '../../../src/lib/haptics';

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

type ClimbListItemProps = {
  climb: Climb;
  gradeColor: string;
  onPress: (climb: Climb) => void;
  onContextAction: (actionTitle: string, climb: Climb) => void;
  contextMenuActions: Array<{ title: string; systemIcon: string }>;
};

const ClimbListItem = memo(function ClimbListItem({
  climb,
  gradeColor,
  onPress,
  onContextAction,
  contextMenuActions,
}: ClimbListItemProps) {
  const handlePress = useCallback(() => onPress(climb), [climb, onPress]);
  const handleContext = useCallback(
    (event: { nativeEvent: { name: string } }) => onContextAction(event.nativeEvent.name, climb),
    [climb, onContextAction],
  );

  return (
    <ContextMenu actions={contextMenuActions} onPress={handleContext}>
      <ClimbListRow climb={climb} gradeName={climb.difficulty} gradeColor={gradeColor} onPress={handlePress} />
    </ContextMenu>
  );
});

export default function ClimbList() {
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation('climbs');

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wire up the native search bar's onChangeText
  useEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        placeholder: t('search.placeholders.climbs'),
        autoCapitalize: 'none',
        hideWhenScrolling: false,
        onChangeText: (event: { nativeEvent: { text: string } }) => {
          const text = event.nativeEvent.text;

          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = setTimeout(() => {
            setDebouncedSearch(text);
          }, SEARCH_DEBOUNCE_MS);
        },
      },
    });

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [navigation, t]);

  const { data: defaultBoard, isLoading: isBoardLoading } = useDefaultBoard();

  const boardName = defaultBoard?.boardType ?? '';
  const layoutId = defaultBoard?.layoutId ?? 0;
  const sizeId = defaultBoard?.sizeId ?? 0;
  const setIds = defaultBoard?.setIds ?? '';
  const angle = defaultBoard?.angle ?? 0;

  const hasBoardConfig = !!defaultBoard;

  // Track pagination
  const [pageNumber, setPageNumber] = useState(1);
  // Accumulate climbs across pages for infinite scroll
  const [accumulatedClimbs, setAccumulatedClimbs] = useState<Climb[]>([]);

  // Combined search-reset effect: clear accumulated climbs and reset page when search changes
  useEffect(() => {
    setAccumulatedClimbs([]);
    setPageNumber(1);
  }, [debouncedSearch]);

  const searchInput = useMemo(
    () => ({
      boardName,
      layoutId,
      sizeId,
      setIds,
      angle,
      ...(debouncedSearch.length > 0 ? { name: debouncedSearch } : {}),
      page: pageNumber,
      pageSize: PAGE_SIZE,
      sortBy: 'popular',
      sortOrder: 'desc',
    }),
    [boardName, layoutId, sizeId, setIds, angle, debouncedSearch, pageNumber],
  );

  const {
    data: searchResult,
    isLoading: isClimbsLoading,
    isRefetching,
    refetch,
  } = useSearchClimbs(searchInput, hasBoardConfig);
  const hasMore = searchResult?.hasMore ?? false;
  const isLoadingMoreRef = useRef(false);

  useEffect(() => {
    if (!searchResult?.climbs) return;

    isLoadingMoreRef.current = false;

    if (pageNumber === 1) {
      setAccumulatedClimbs(searchResult.climbs);
    } else {
      setAccumulatedClimbs((previous) => {
        // Deduplicate by uuid
        const existingUuids = new Set(previous.map((climb) => climb.uuid));
        const newClimbs = searchResult.climbs.filter((climb) => !existingUuids.has(climb.uuid));
        return [...previous, ...newClimbs];
      });
    }
  }, [searchResult?.climbs, pageNumber]);

  const handleRefresh = useCallback(() => {
    setAccumulatedClimbs([]);
    setPageNumber(1);
    refetch();
  }, [refetch]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isClimbsLoading && !isRefetching && !isLoadingMoreRef.current) {
      isLoadingMoreRef.current = true;
      setPageNumber((previous) => previous + 1);
    }
  }, [hasMore, isClimbsLoading, isRefetching]);

  const handleClimbPress = useCallback(
    (climb: Climb) => {
      router.push({
        pathname: '/(tabs)/climbs/[climbUuid]',
        params: {
          climbUuid: climb.uuid,
          boardName,
          layoutId: String(layoutId),
          sizeId: String(sizeId),
          setIds,
          angle: String(angle),
        },
      });
    },
    [router, boardName, layoutId, sizeId, setIds, angle],
  );

  const handleContextAction = useCallback(
    (actionTitle: string, _climb: Climb) => {
      hapticSelection();
      // Context actions will be wired up as features are built
      switch (actionTitle) {
        case t('mobile.contextMenu.addToQueue'):
          break;
        case t('actions.favorite.label.favorite'):
          break;
        case t('share.actionLabel'):
          break;
        case t('mobile.contextMenu.viewSetter'):
          break;
      }
    },
    [t],
  );

  const contextMenuActions = useMemo(
    () =>
      [
        { title: t('mobile.contextMenu.addToQueue'), systemIcon: 'list.bullet' },
        { title: t('actions.favorite.label.favorite'), systemIcon: 'heart' },
        { title: t('share.actionLabel'), systemIcon: 'square.and.arrow.up' },
        { title: t('mobile.contextMenu.viewSetter'), systemIcon: 'person' },
      ],
    [t],
  );

  const isInitialLoading = isBoardLoading || (isClimbsLoading && accumulatedClimbs.length === 0);

  const renderClimbItem = useCallback(
    ({ item: climb }: { item: Climb }) => {
      const gradeColor = getGradeColor(climb.difficulty) ?? DEFAULT_GRADE_COLOR;

      return (
        <ClimbListItem
          climb={climb}
          gradeColor={gradeColor}
          onPress={handleClimbPress}
          onContextAction={handleContextAction}
          contextMenuActions={contextMenuActions}
        />
      );
    },
    [handleClimbPress, handleContextAction, contextMenuActions],
  );

  if (!hasBoardConfig && !isBoardLoading) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="boards" size={48} color="#C7C7CC" />
        <Text variant="headline" style={styles.emptyTitle}>
          {t('mobile.emptyState.noBoard.title')}
        </Text>
        <Text variant="subheadline" style={styles.emptySubtitle}>
          {t('mobile.emptyState.noBoard.subtitle')}
        </Text>
      </View>
    );
  }

  if (isInitialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const isEmpty = accumulatedClimbs.length === 0 && !isClimbsLoading;

  return (
    <View style={styles.container}>
      <FlashList
        data={accumulatedClimbs}
        renderItem={renderClimbItem}
        keyExtractor={keyExtractor}
        estimatedItemSize={68}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor="#8C4A52" />}
        ListFooterComponent={
          isClimbsLoading && accumulatedClimbs.length > 0 ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          isEmpty ? (
            <View style={styles.emptyContainer}>
              <Icon name="search" size={48} color="#C7C7CC" />
              <Text variant="headline" style={styles.emptyTitle}>
                {debouncedSearch.length > 0
                  ? t('mobile.emptyState.noMatches.title')
                  : t('mobile.emptyState.noClimbs.title')}
              </Text>
              <Text variant="subheadline" style={styles.emptySubtitle}>
                {debouncedSearch.length > 0
                  ? t('mobile.emptyState.noMatches.description', { query: debouncedSearch })
                  : t('mobile.emptyState.noClimbs.subtitle')}
              </Text>
            </View>
          ) : null
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    marginTop: 12,
    opacity: 0.6,
  },
  emptySubtitle: {
    opacity: 0.4,
    textAlign: 'center',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
