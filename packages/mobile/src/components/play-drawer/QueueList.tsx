import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { buildQueueListModel, type QueueFlatRow } from '@boardsesh/play-view';
import { QueueItemRow } from '../QueueItemRow';
import { Text } from '../Text';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { brandColors } from '../../theme/colors';

type QueueListProps = {
  queue: ClimbQueueItem[];
  currentItemUuid: string | null;
  isEditMode: boolean;
  showHistory: boolean;
  showFullHistory: boolean;
  selectedItems: Set<string>;
  autoScrollOnMount?: boolean;
  onToggleSelect: (uuid: string) => void;
  onClimbPress: (item: ClimbQueueItem) => void;
  onRemove: (uuid: string) => void;
  onShowFullHistory: () => void;
};

export function QueueList({
  queue,
  currentItemUuid,
  isEditMode,
  showHistory,
  showFullHistory,
  selectedItems,
  autoScrollOnMount,
  onToggleSelect,
  onClimbPress,
  onRemove,
  onShowFullHistory,
}: QueueListProps) {
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();
  const flatListRef = useRef<InstanceType<typeof BottomSheetFlatList>>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  const { flatRows, currentItemFlatIndex } = useMemo(
    () => buildQueueListModel(queue, currentItemUuid, { showHistory, showFullHistory }),
    [queue, currentItemUuid, showHistory, showFullHistory],
  );

  useEffect(() => {
    if (autoScrollOnMount && currentItemFlatIndex >= 0 && flatRows.length > 0) {
      const timer = setTimeout(() => {
        (
          flatListRef.current as {
            scrollToIndex?: (params: { index: number; animated: boolean; viewPosition: number }) => void;
          }
        )?.scrollToIndex?.({
          index: currentItemFlatIndex,
          animated: true,
          viewPosition: 0.3,
        });
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoScrollOnMount, currentItemFlatIndex, flatRows.length]);

  const keyExtractor = useCallback((row: QueueFlatRow, index: number): string => {
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
      default:
        return `row-${String(index)}`;
    }
  }, []);

  const renderRow = useCallback(
    ({ item: row }: { item: QueueFlatRow }) => {
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
              isCurrentClimb={false}
              isHistoryItem
              isEditMode={isEditMode}
              isSelected={selectedItems.has(row.item.uuid)}
              onPress={onClimbPress}
              onRemove={onRemove}
              onToggleSelect={onToggleSelect}
            />
          );

        case 'current-item':
          return (
            <QueueItemRow
              item={row.item}
              position={row.queueIndex + 1}
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
              isCurrentClimb={false}
              isEditMode={isEditMode}
              isSelected={selectedItems.has(row.item.uuid)}
              onPress={onClimbPress}
              onRemove={onRemove}
              onToggleSelect={onToggleSelect}
            />
          );

        default:
          return null;
      }
    },
    [isEditMode, selectedItems, onClimbPress, onRemove, onToggleSelect, onShowFullHistory, systemColors.separator, t],
  );

  if (flatRows.length === 0) {
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
      ref={flatListRef as unknown as React.RefObject<InstanceType<typeof BottomSheetFlatList>>}
      data={flatRows}
      keyExtractor={keyExtractor}
      renderItem={renderRow}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
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
});
