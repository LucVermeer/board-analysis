import { memo, useCallback, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { ClimbListItemContent } from '../../ClimbListItemContent';
import { THUMBNAIL_WIDTH } from '../../ClimbListThumbnail';
import { Icon } from '../../Icon';
import type { QueueItemRowBoard } from '../../QueueItemRow';
import { useTheme } from '../../../providers/theme-provider';
import { iosSystemColors } from '../../../theme/ios-colors';
import { spacing } from '../../../theme/tokens';
import { hapticSelection } from '../../../lib/haptics';

type WorkoutPreviewRowProps = {
  item: ClimbQueueItem;
  board: QueueItemRowBoard;
  /** Highlight the row tapped to open in the play drawer. */
  isActive: boolean;
  /** Show a spinner + disable the refresh button while this row regenerates. */
  isRefreshing: boolean;
  onPress: (item: ClimbQueueItem) => void;
  onRefresh: (uuid: string) => void;
};

/**
 * A workout-preview row: the shared climb visual (`ClimbListItemContent`) plus a
 * refresh button that regenerates just this climb. Deliberately lightweight — no
 * swipe/drag/edit baggage from `QueueItemRow`, since the preview is a read-and-
 * tweak surface, not the live queue.
 */
function WorkoutPreviewRowComponent({
  item,
  board,
  isActive,
  isRefreshing,
  onPress,
  onRefresh,
}: WorkoutPreviewRowProps) {
  const { systemColors, brandColors } = useTheme();
  const { t } = useTranslation('session');
  const itemRef = useRef(item);
  itemRef.current = item;

  const handlePress = useCallback(() => {
    hapticSelection();
    onPress(itemRef.current);
  }, [onPress]);

  const handleRefresh = useCallback(() => {
    hapticSelection();
    onRefresh(item.uuid);
  }, [item.uuid, onRefresh]);

  const climbName = item.climb?.name ?? t('mobile.queue.unknownClimb');

  return (
    <View>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={climbName}
        accessibilityState={{ selected: isActive }}
        style={[
          styles.row,
          { backgroundColor: systemColors.secondaryBackground },
          isActive && { backgroundColor: `${brandColors.primary}14` },
        ]}
      >
        <ClimbListItemContent
          climb={item.climb}
          boardName={board.boardName}
          layoutId={board.layoutId}
          sizeId={board.sizeId}
          setIds={board.setIds}
          angle={board.angle}
        />

        <Pressable
          onPress={handleRefresh}
          disabled={isRefreshing}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.session.preRegenerateClimb')}
          style={styles.refreshButton}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={iosSystemColors.systemGray} />
          ) : (
            <Icon name="refresh" size={22} color={iosSystemColors.systemGray} />
          )}
        </Pressable>
      </Pressable>

      <View style={[styles.separator, { backgroundColor: systemColors.separator }]} />
    </View>
  );
}

// Memoized: PreSessionView re-renders on every preview rebuild and refresh-state
// change. Each prop is referentially stable except `item` (a fresh reference
// only for the row that actually changed), so a shallow compare lets untouched
// rows skip re-rendering.
export const WorkoutPreviewRow = memo(WorkoutPreviewRowComponent, (prev, next) => {
  return (
    prev.item.uuid === next.item.uuid &&
    prev.item.climb.uuid === next.item.climb.uuid &&
    prev.isActive === next.isActive &&
    prev.isRefreshing === next.isRefreshing &&
    prev.onPress === next.onPress &&
    prev.onRefresh === next.onRefresh &&
    prev.board.boardName === next.board.boardName &&
    prev.board.layoutId === next.board.layoutId &&
    prev.board.sizeId === next.board.sizeId &&
    prev.board.setIds === next.board.setIds &&
    prev.board.angle === next.board.angle
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing[3],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  refreshButton: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    // Inset to start under the climb name (after the thumbnail), matching the
    // queue list's row separators.
    marginLeft: spacing[3] + THUMBNAIL_WIDTH + spacing[3],
  },
});
