import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { BottomSheetFlatList, type BottomSheetFlatListMethods } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { Climb, ClimbQueueItem, PlaylistSuggestionSource } from '@boardsesh/queue';
import { getPlaylistSuggestedClimbs } from '@boardsesh/queue';
import { buildQueueListModel, type QueueFlatRow } from '@boardsesh/play-view';
import { QueueItemRow, type QueueItemRowBoard } from '../QueueItemRow';
import { ClimbListItemContent } from '../ClimbListItemContent';
import { THUMBNAIL_WIDTH } from '../ClimbListThumbnail';
import { Text } from '../Text';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { brandColors } from '../../theme/colors';
import { hapticSelection } from '../../lib/haptics';
import { useSearchClimbs } from '../../lib/graphql/hooks';
import { toClimbSearchInput, DEFAULT_CLIMB_FILTER_STATE } from '@boardsesh/climb-filters';
import { useQueueDrag } from './use-queue-drag';

const POSITION_SLOT_WIDTH = 28;
// Match QueueItemRow's separator inset so suggestion separators line up.
const SEPARATOR_INSET = spacing[3] + POSITION_SLOT_WIDTH + spacing[3] + THUMBNAIL_WIDTH + spacing[3];

type SuggestionRow = { type: 'suggestion'; climb: Climb };
type QueueListRow = QueueFlatRow | SuggestionRow;

// Show only the last 2 climbed by default; "show full history" expands the rest.
const HISTORY_DISPLAY_LIMIT = 2;
// How many popular climbs to pull for the no-playlist suggestion feed.
const SUGGESTION_PAGE_SIZE = 50;

type QueueListProps = {
  queue: ClimbQueueItem[];
  currentItemUuid: string | null;
  board: QueueItemRowBoard;
  isEditMode: boolean;
  showHistory: boolean;
  showFullHistory: boolean;
  selectedItems: Set<string>;
  playlistSuggestionSource: PlaylistSuggestionSource | null;
  autoScrollOnMount?: boolean;
  onToggleSelect: (uuid: string) => void;
  onClimbPress: (item: ClimbQueueItem) => void;
  onRemove: (uuid: string) => void;
  onShowFullHistory: () => void;
  onTickHistory: (item: ClimbQueueItem) => void;
  onSuggestionPress: (climb: Climb) => void;
  reorderQueue: (uuid: string, oldIndex: number, newIndex: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
};

export function QueueList({
  queue,
  currentItemUuid,
  board,
  isEditMode,
  showHistory,
  showFullHistory,
  selectedItems,
  playlistSuggestionSource,
  autoScrollOnMount,
  onToggleSelect,
  onClimbPress,
  onRemove,
  onShowFullHistory,
  onTickHistory,
  onSuggestionPress,
  reorderQueue,
  onDraggingChange,
}: QueueListProps) {
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();
  const flatListRef = useRef<BottomSheetFlatListMethods | null>(null);

  const { flatRows, currentItemFlatIndex } = useMemo(
    () =>
      buildQueueListModel(queue, currentItemUuid, {
        showHistory,
        showFullHistory,
        historyDisplayLimit: HISTORY_DISPLAY_LIMIT,
      }),
    [queue, currentItemUuid, showHistory, showFullHistory],
  );

  // Suggested climbs flow directly after the queue rows — NO header, NO divider
  // (the intentional divergence from web). Playlist suggestions (when a playlist
  // is active) come first, then a popular (by-ascents) feed for the board tops
  // the list up. The feed is ALWAYS fetched (not gated on the playlist source)
  // so suggestions never vanish when the source flips or its climbs go empty —
  // they just fall back to the feed. Everything already in the queue is excluded.
  const playlistSuggestions = useMemo(
    () => getPlaylistSuggestedClimbs(playlistSuggestionSource, queue),
    [playlistSuggestionSource, queue],
  );

  const searchInput = useMemo(
    () => toClimbSearchInput(DEFAULT_CLIMB_FILTER_STATE, board, { page: 1, pageSize: SUGGESTION_PAGE_SIZE }),
    [board],
  );
  const { data: searchResult } = useSearchClimbs(searchInput, true);

  const suggestions = useMemo<Climb[]>(() => {
    const queued = new Set(queue.map((item) => item.climb?.uuid).filter((uuid): uuid is string => !!uuid));
    const seen = new Set<string>();
    const out: Climb[] = [];
    const add = (climbs: readonly Climb[]) => {
      for (const climb of climbs) {
        if (!climb?.uuid || queued.has(climb.uuid) || seen.has(climb.uuid)) continue;
        seen.add(climb.uuid);
        out.push(climb);
      }
    };
    add(playlistSuggestions);
    add(searchResult?.climbs ?? []);
    return out;
  }, [playlistSuggestions, searchResult, queue]);

  const rows = useMemo<QueueListRow[]>(
    () => [...flatRows, ...suggestions.map((climb): SuggestionRow => ({ type: 'suggestion', climb }))],
    [flatRows, suggestions],
  );

  // The contiguous draggable window: the `future-item` rows (upcoming queue).
  const { firstFutureRowIndex, lastFutureRowIndex, firstFutureQueueIndex } = useMemo(() => {
    let first = -1;
    let last = -1;
    let firstQueue = -1;
    rows.forEach((row, index) => {
      if (row.type === 'future-item') {
        if (first === -1) {
          first = index;
          firstQueue = row.queueIndex;
        }
        last = index;
      }
    });
    return { firstFutureRowIndex: first, lastFutureRowIndex: last, firstFutureQueueIndex: firstQueue };
  }, [rows]);

  const drag = useQueueDrag({
    reorderQueue,
    firstFutureRowIndex,
    lastFutureRowIndex,
    firstFutureQueueIndex,
  });

  useEffect(() => {
    onDraggingChange?.(drag.isDragging);
  }, [drag.isDragging, onDraggingChange]);

  useEffect(() => {
    if (autoScrollOnMount && currentItemFlatIndex >= 0 && rows.length > 0) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToIndex?.({
          index: currentItemFlatIndex,
          animated: true,
          viewPosition: 0.3,
        });
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoScrollOnMount, currentItemFlatIndex, rows.length]);

  const keyExtractor = useCallback((row: QueueListRow, index: number): string => {
    switch (row.type) {
      case 'history-show-all':
        return 'history-show-all';
      case 'history-divider':
        return 'history-divider';
      case 'history-item':
        return `history-${row.item.uuid}`;
      case 'current-item':
        return `current-${row.item.uuid}`;
      case 'future-item':
        return `future-${row.item.uuid}`;
      case 'suggestion':
        return `suggestion-${row.climb.uuid}`;
      default:
        return `row-${String(index)}`;
    }
  }, []);

  const handleSuggestionPress = useCallback(
    (climb: Climb) => {
      hapticSelection();
      onSuggestionPress(climb);
    },
    [onSuggestionPress],
  );

  const renderRow = useCallback(
    ({ item: row, index }: { item: QueueListRow; index: number }) => {
      switch (row.type) {
        case 'history-show-all':
          return (
            <Pressable
              onPress={onShowFullHistory}
              style={styles.showAllRow}
              accessibilityRole="button"
              accessibilityLabel={t('queueList.showFullHistoryAria', { count: row.hiddenCount })}
            >
              <Text variant="subheadline" color={brandColors.primary}>
                {t('queueList.showFullHistory', { count: row.hiddenCount })}
              </Text>
            </Pressable>
          );

        case 'history-divider':
          return <View style={[styles.divider, { backgroundColor: systemColors.separator }]} />;

        case 'history-item':
          return (
            <QueueItemRow
              item={row.item}
              position={row.queueIndex + 1}
              board={board}
              isCurrentClimb={false}
              isHistoryItem
              isEditMode={isEditMode}
              isSelected={selectedItems.has(row.item.uuid)}
              onPress={onClimbPress}
              onRemove={onRemove}
              onToggleSelect={onToggleSelect}
              onTickHistory={onTickHistory}
            />
          );

        case 'current-item':
          return (
            <QueueItemRow
              item={row.item}
              position={row.queueIndex + 1}
              board={board}
              isCurrentClimb
              isEditMode={isEditMode}
              isSelected={selectedItems.has(row.item.uuid)}
              onPress={onClimbPress}
              onRemove={onRemove}
              onToggleSelect={onToggleSelect}
            />
          );

        case 'future-item':
          return (
            <QueueItemRow
              item={row.item}
              position={row.queueIndex + 1}
              board={board}
              isCurrentClimb={false}
              isEditMode={isEditMode}
              isSelected={selectedItems.has(row.item.uuid)}
              onPress={onClimbPress}
              onRemove={onRemove}
              onToggleSelect={onToggleSelect}
              drag={drag}
              rowIndex={index}
              queueIndex={row.queueIndex}
              isDraggable={!isEditMode}
            />
          );

        case 'suggestion':
          return (
            <View>
              <Pressable
                onPress={() => handleSuggestionPress(row.climb)}
                accessibilityRole="button"
                accessibilityLabel={row.climb.name}
                style={[styles.suggestionRow, { backgroundColor: systemColors.secondaryBackground }]}
              >
                <View style={styles.suggestionSpacer} />
                <ClimbListItemContent
                  climb={row.climb}
                  boardName={board.boardName}
                  layoutId={board.layoutId}
                  sizeId={board.sizeId}
                  setIds={board.setIds}
                  angle={board.angle}
                />
              </Pressable>
              <View style={[styles.separator, { backgroundColor: systemColors.separator }]} />
            </View>
          );

        default:
          return null;
      }
    },
    [
      board,
      drag,
      isEditMode,
      selectedItems,
      onClimbPress,
      onRemove,
      onToggleSelect,
      onTickHistory,
      onShowFullHistory,
      handleSuggestionPress,
      systemColors.separator,
      systemColors.secondaryBackground,
      t,
    ],
  );

  if (rows.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="body" color={iosSystemColors.systemGray}>
          {t('mobile.queueSheet.emptyQueue')}
        </Text>
      </View>
    );
  }

  return (
    <BottomSheetFlatList
      ref={flatListRef}
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderRow}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!drag.isDragging}
      onScrollToIndexFailed={() => {
        // Silently handle if scroll target isn't rendered yet
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing[10],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[16],
  },
  showAllRow: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing[1],
    marginHorizontal: spacing[4],
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing[3],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  suggestionSpacer: {
    width: POSITION_SLOT_WIDTH,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SEPARATOR_INSET,
  },
});
