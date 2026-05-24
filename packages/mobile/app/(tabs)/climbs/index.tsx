import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, RefreshControl, Image } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type BottomSheet from '@gorhom/bottom-sheet';
import type { Climb, BoardName } from '@boardsesh/shared-schema';
import { ClimbListRow } from '../../../src/components/ClimbListRow';
import { ClimbActionsSheet } from '../../../src/components/ClimbActionsSheet';
import { ActivityIndicator } from '../../../src/components/ActivityIndicator';
import { Text } from '../../../src/components/Text';
import { Icon } from '../../../src/components/Icon';
import {
  ClimbFilterSheet,
  hasActiveFilters,
  DEFAULT_FILTERS,
  type ClimbFilters,
} from '../../../src/components/ClimbFilterSheet';
import { useDefaultBoard, useSearchClimbs } from '../../../src/lib/graphql/hooks';
import { useQueue } from '../../../src/providers/queue-provider';
import { accumulateClimbs } from '../../../src/lib/climb-pagination';
import { getBoardRenderData } from '../../../src/lib/board-details';
import { brandColors } from '../../../src/theme/colors';
import { iosSystemColors } from '../../../src/theme/ios-colors';
import { hapticSuccess } from '../../../src/lib/haptics';
import { Pressable } from 'react-native';

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

export default function ClimbList() {
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation('climbs');

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filters, setFilters] = useState<ClimbFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const filtersActive = hasActiveFilters(filters);

  const handleOpenFilters = useCallback(() => {
    setShowFilters(true);
  }, []);

  const handleDismissFilters = useCallback(() => {
    setShowFilters(false);
  }, []);

  const handleApplyFilters = useCallback((newFilters: ClimbFilters) => {
    setFilters(newFilters);
    setShowFilters(false);
  }, []);

  // Wire up the native search bar's onChangeText and header right filter button
  useEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        placeholder: t('search.placeholders.climbs'),
        autoCapitalize: 'none',
        hideWhenScrolling: false,
        onChangeText: (event: { nativeEvent: { text: string } }) => {
          const searchText = event.nativeEvent.text;

          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = setTimeout(() => {
            setDebouncedSearch(searchText);
          }, SEARCH_DEBOUNCE_MS);
        },
      },
      headerRight: () => (
        <Pressable onPress={handleOpenFilters} hitSlop={8} accessibilityRole="button">
          <Icon name="filter" size={22} color={filtersActive ? brandColors.primary : iosSystemColors.systemGray} />
        </Pressable>
      ),
    });

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [navigation, t, filtersActive, handleOpenFilters]);

  const { data: defaultBoard, isLoading: isBoardLoading } = useDefaultBoard();

  const boardName = (defaultBoard?.boardType ?? '') as BoardName;
  const layoutId = defaultBoard?.layoutId ?? 0;
  const sizeId = defaultBoard?.sizeId ?? 0;
  const setIds = defaultBoard?.setIds ?? '';
  const angle = defaultBoard?.angle ?? 0;

  const hasBoardConfig = !!defaultBoard;

  // Compute board render data once for all thumbnails
  const boardRenderData = useMemo(() => {
    if (!defaultBoard) return null;
    const parsedSetIds = defaultBoard.setIds.split(',').map(Number);
    return getBoardRenderData({
      boardName: defaultBoard.boardType as BoardName,
      layoutId: defaultBoard.layoutId,
      sizeId: defaultBoard.sizeId,
      setIds: parsedSetIds,
    });
  }, [defaultBoard]);

  // Pre-warm board images so they're cached before the user taps into a climb
  useEffect(() => {
    if (!boardRenderData) return;
    for (const url of boardRenderData.imageUrls) {
      Image.prefetch(url);
    }
  }, [boardRenderData]);

  // Track pagination
  const [pageNumber, setPageNumber] = useState(1);
  // Accumulate climbs across pages for infinite scroll
  const [accumulatedClimbs, setAccumulatedClimbs] = useState<Climb[]>([]);

  // Clear accumulated climbs and reset page when search or filters change
  useEffect(() => {
    setAccumulatedClimbs([]);
    setPageNumber(1);
  }, [debouncedSearch, filters]);

  const searchInput = useMemo(
    () => ({
      boardName: boardName as string,
      layoutId,
      sizeId,
      setIds,
      angle,
      ...(debouncedSearch.length > 0 ? { name: debouncedSearch } : {}),
      page: pageNumber,
      pageSize: PAGE_SIZE,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      ...(filters.minGrade != null ? { minGrade: filters.minGrade } : {}),
      ...(filters.maxGrade != null ? { maxGrade: filters.maxGrade } : {}),
      ...(filters.minAscents != null ? { minAscents: filters.minAscents } : {}),
      ...(filters.minRating != null ? { minRating: filters.minRating } : {}),
    }),
    [boardName, layoutId, sizeId, setIds, angle, debouncedSearch, pageNumber, filters],
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

    setAccumulatedClimbs((previous) => accumulateClimbs(previous, searchResult.climbs, pageNumber));
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
    (pressedClimb: Climb) => {
      router.push({
        pathname: '/(tabs)/climbs/[climbUuid]',
        params: {
          climbUuid: pressedClimb.uuid,
          boardName: boardName as string,
          layoutId: String(layoutId),
          sizeId: String(sizeId),
          setIds,
          angle: String(angle),
        },
      });
    },
    [router, boardName, layoutId, sizeId, setIds, angle],
  );

  // --- Queue integration ---
  const { addToQueue } = useQueue();

  const handleAddToQueue = useCallback(
    (climb: Climb) => {
      hapticSuccess();
      addToQueue({
        uuid: `queue-${climb.uuid}-${Date.now()}`,
        climb,
      });
    },
    [addToQueue],
  );

  // --- Actions sheet ---
  const actionsSheetRef = useRef<BottomSheet>(null);
  const [activeActionClimb, setActiveActionClimb] = useState<Climb | null>(null);

  const handleOpenActions = useCallback((climb: Climb) => {
    setActiveActionClimb(climb);
    actionsSheetRef.current?.expand();
  }, []);

  const handleDismissActions = useCallback(() => {
    actionsSheetRef.current?.close();
    setActiveActionClimb(null);
  }, []);

  const handleActionAddToQueue = useCallback(() => {
    if (activeActionClimb) {
      handleAddToQueue(activeActionClimb);
    }
  }, [activeActionClimb, handleAddToQueue]);

  const isInitialLoading = isBoardLoading || (isClimbsLoading && accumulatedClimbs.length === 0);

  const renderClimbItem = useCallback(
    ({ item: climb }: { item: Climb }) => {
      return (
        <ClimbListRow
          climb={climb}
          boardName={boardName}
          boardRenderData={boardRenderData}
          angle={angle}
          onPress={handleClimbPress}
          onAddToQueue={handleAddToQueue}
          onOpenActions={handleOpenActions}
        />
      );
    },
    [handleClimbPress, boardName, boardRenderData, angle, handleAddToQueue, handleOpenActions],
  );

  if (!hasBoardConfig && !isBoardLoading) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="boards" size={48} color={iosSystemColors.systemGray4} />
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
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={brandColors.primary} />
        }
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
              <Icon name="search" size={48} color={iosSystemColors.systemGray4} />
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
      <ClimbFilterSheet
        visible={showFilters}
        onDismiss={handleDismissFilters}
        boardName={boardName as string}
        currentFilters={filters}
        onApply={handleApplyFilters}
      />
      <ClimbActionsSheet
        ref={actionsSheetRef}
        climb={activeActionClimb}
        onAddToQueue={handleActionAddToQueue}
        onDismiss={handleDismissActions}
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
