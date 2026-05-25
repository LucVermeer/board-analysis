import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Pressable, StyleSheet, RefreshControl, Image, Keyboard } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Climb, BoardName } from '@boardsesh/shared-schema';
import { ClimbListRow } from '../../../src/components/ClimbListRow';
import { ActivityIndicator } from '../../../src/components/ActivityIndicator';
import { Text } from '../../../src/components/Text';
import { Icon } from '../../../src/components/Icon';
import {
  ClimbFilterSheet,
  hasActiveFilters,
  DEFAULT_FILTERS,
  type ClimbFilters,
} from '../../../src/components/ClimbFilterSheet';
import { PlayDrawer, type PlayDrawerHandle } from '../../../src/components/play-drawer';
import { SearchHeader, type SearchHeaderHandle } from '../../../src/components/SearchHeader';
import { RecentFilterPills } from '../../../src/components/RecentFilterPills';
import { useDefaultBoard, useSearchClimbs, useGrades } from '../../../src/lib/graphql/hooks';
import { accumulateClimbs } from '../../../src/lib/climb-pagination';
import { getBoardRenderData } from '../../../src/lib/board-details';
import { getRecentFilters, addRecentFilter, clearRecentFilters, type RecentFilter } from '../../../src/lib/recent-filter-store';
import { getFilterSummary } from '../../../src/lib/filter-summary';
import { brandColors } from '../../../src/theme/colors';
import { iosSystemColors } from '../../../src/theme/ios-colors';

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

export default function ClimbList() {
  const navigation = useNavigation();
  const { t } = useTranslation('climbs');
  const playDrawerRef = useRef<PlayDrawerHandle>(null);
  const searchHeaderRef = useRef<SearchHeaderHandle>(null);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debouncedSearchRef = useRef('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchTextLength, setSearchTextLength] = useState(0);
  const [filters, setFilters] = useState<ClimbFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [recentFilters, setRecentFilters] = useState<RecentFilter[]>([]);

  const filtersActive = hasActiveFilters(filters);

  const handleOpenFilters = useCallback(() => {
    setShowFilters(true);
  }, []);

  const handleDismissFilters = useCallback(() => {
    setShowFilters(false);
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setSearchTextLength(text.length);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debouncedSearchRef.current = text;
      setDebouncedSearch(text);
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const handleSearchFocus = useCallback(() => {
    setIsSearchFocused(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    setIsSearchFocused(false);
  }, []);

  // Set up header once — SearchHeader manages its own text state internally
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <SearchHeader
          ref={searchHeaderRef}
          placeholder={t('search.placeholders.climbs')}
          onChangeText={handleSearchChange}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
        />
      ),
    });
  }, [navigation, t, handleSearchChange, handleSearchFocus, handleSearchBlur]);

  // Separate effect for headerRight since it depends on filtersActive
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={handleOpenFilters} hitSlop={8} accessibilityRole="button">
          <Icon name="filter" size={22} color={filtersActive ? brandColors.primary : iosSystemColors.systemGray} />
        </Pressable>
      ),
    });
  }, [navigation, filtersActive, handleOpenFilters]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Load recent filters on mount
  useEffect(() => {
    getRecentFilters().then(setRecentFilters).catch(() => {});
  }, []);

  const { data: defaultBoard, isLoading: isBoardLoading } = useDefaultBoard();

  const boardName = defaultBoard?.boardType ?? '';
  const layoutId = defaultBoard?.layoutId ?? 0;
  const sizeId = defaultBoard?.sizeId ?? 0;
  const setIds = defaultBoard?.setIds ?? '';
  const angle = defaultBoard?.angle ?? 0;

  const hasBoardConfig = !!defaultBoard;

  const { data: gradesData } = useGrades(boardName);
  const gradesRef = useRef(gradesData);
  gradesRef.current = gradesData;

  // Pre-warm board images so they're cached before the user taps into a climb
  useEffect(() => {
    if (!defaultBoard) return;
    const parsedSetIds = defaultBoard.setIds.split(',').map(Number);
    const renderData = getBoardRenderData({
      boardName: defaultBoard.boardType as BoardName,
      layoutId: defaultBoard.layoutId,
      sizeId: defaultBoard.sizeId,
      setIds: parsedSetIds,
    });
    if (renderData?.imageUrls) {
      for (const url of renderData.imageUrls) {
        Image.prefetch(url);
      }
    }
  }, [defaultBoard]);

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
      boardName,
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

  const boardConfig = useMemo(
    () =>
      hasBoardConfig
        ? { boardName, layoutId, sizeId, setIds, angle }
        : null,
    [hasBoardConfig, boardName, layoutId, sizeId, setIds, angle],
  );

  const handleClimbPress = useCallback(
    (climb: Climb) => {
      playDrawerRef.current?.open(climb);
    },
    [],
  );

  const handleApplyFilters = useCallback(
    (newFilters: ClimbFilters) => {
      setFilters(newFilters);
      setShowFilters(false);

      const currentSearch = debouncedSearchRef.current;
      if (hasActiveFilters(newFilters) || currentSearch.length > 0) {
        const label = getFilterSummary(newFilters, currentSearch, gradesRef.current, t);
        addRecentFilter(label, newFilters, currentSearch)
          .then(() => getRecentFilters())
          .then(setRecentFilters)
          .catch(() => {});
      }
    },
    [t],
  );

  const handleApplyRecentFilter = useCallback(
    (pillFilters: ClimbFilters, pillSearchText: string) => {
      setFilters(pillFilters);
      debouncedSearchRef.current = pillSearchText;
      setDebouncedSearch(pillSearchText);
      setSearchTextLength(pillSearchText.length);
      searchHeaderRef.current?.setText(pillSearchText);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      Keyboard.dismiss();
      searchHeaderRef.current?.blur();
      setIsSearchFocused(false);
    },
    [],
  );

  const handleClearRecentFilters = useCallback(() => {
    clearRecentFilters()
      .then(() => setRecentFilters([]))
      .catch(() => {});
  }, []);

  const showRecentPills = isSearchFocused && searchTextLength === 0 && recentFilters.length > 0;

  const isInitialLoading = isBoardLoading || (isClimbsLoading && accumulatedClimbs.length === 0);

  const renderClimbItem = useCallback(
    ({ item: climb }: { item: Climb }) => (
      <ClimbListRow
        climb={climb}
        boardName={boardName as BoardName}
        layoutId={layoutId}
        sizeId={sizeId}
        setIds={setIds}
        angle={angle}
        onPress={handleClimbPress}
      />
    ),
    [boardName, layoutId, sizeId, setIds, angle, handleClimbPress],
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
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={brandColors.primary} />
        }
        ListHeaderComponent={
          showRecentPills ? (
            <RecentFilterPills
              recentFilters={recentFilters}
              currentFilters={filters}
              currentSearchText={debouncedSearch}
              onApply={handleApplyRecentFilter}
              onClear={handleClearRecentFilters}
            />
          ) : null
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
        boardName={boardName}
        currentFilters={filters}
        onApply={handleApplyFilters}
      />
      {boardConfig && (
        <PlayDrawer ref={playDrawerRef} boardConfig={boardConfig} />
      )}
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
