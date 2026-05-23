import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation, useRouter } from 'expo-router';
import ContextMenu from 'react-native-context-menu-view';
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

export default function ClimbList() {
  const router = useRouter();
  const navigation = useNavigation();

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wire up the native search bar's onChangeText
  useEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        placeholder: 'Search climbs...',
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
  }, [navigation]);

  const { data: defaultBoard, isLoading: isBoardLoading } = useDefaultBoard();

  const boardName = defaultBoard?.boardType ?? '';
  const layoutId = defaultBoard?.layoutId ?? 0;
  const sizeId = defaultBoard?.sizeId ?? 0;
  const setIds = defaultBoard?.setIds ?? '';
  const angle = defaultBoard?.angle ?? 0;

  const hasBoardConfig = !!defaultBoard;

  // Track pagination
  const [pageNumber, setPageNumber] = useState(1);

  // Reset page when search changes
  useEffect(() => {
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

  // Accumulate climbs across pages for infinite scroll
  const [accumulatedClimbs, setAccumulatedClimbs] = useState<Climb[]>([]);
  const hasMore = searchResult?.hasMore ?? false;

  useEffect(() => {
    if (!searchResult?.climbs) return;

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

  // Reset accumulated climbs when search changes
  useEffect(() => {
    setAccumulatedClimbs([]);
  }, [debouncedSearch]);

  const handleRefresh = useCallback(() => {
    setPageNumber(1);
    refetch();
  }, [refetch]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isClimbsLoading && !isRefetching) {
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
        case 'Add to Queue':
          break;
        case 'Favorite':
          break;
        case 'Share':
          break;
        case 'View Setter':
          break;
      }
    },
    [],
  );

  const isInitialLoading = isBoardLoading || (isClimbsLoading && accumulatedClimbs.length === 0);

  const renderClimbItem = useCallback(
    ({ item: climb }: { item: Climb }) => {
      const gradeColor = getGradeColor(climb.difficulty) ?? DEFAULT_GRADE_COLOR;

      return (
        <ContextMenu
          actions={[
            { title: 'Add to Queue', systemIcon: 'list.bullet' },
            { title: 'Favorite', systemIcon: 'heart' },
            { title: 'Share', systemIcon: 'square.and.arrow.up' },
            { title: 'View Setter', systemIcon: 'person' },
          ]}
          onPress={(event) => handleContextAction(event.nativeEvent.name, climb)}
        >
          <ClimbListRow
            climb={climb}
            gradeName={climb.difficulty}
            gradeColor={gradeColor}
            onPress={() => handleClimbPress(climb)}
          />
        </ContextMenu>
      );
    },
    [handleClimbPress, handleContextAction],
  );

  if (!hasBoardConfig && !isBoardLoading) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="boards" size={48} color="#C7C7CC" />
        <Text variant="headline" style={styles.emptyTitle}>
          No board selected
        </Text>
        <Text variant="subheadline" style={styles.emptySubtitle}>
          Add a board first to browse climbs
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
                {debouncedSearch.length > 0 ? 'No matches' : 'No climbs found'}
              </Text>
              <Text variant="subheadline" style={styles.emptySubtitle}>
                {debouncedSearch.length > 0
                  ? `Nothing matches "${debouncedSearch}"`
                  : 'Try adjusting your board settings'}
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
