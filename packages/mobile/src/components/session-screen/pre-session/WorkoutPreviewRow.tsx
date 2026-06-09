import { memo, useCallback, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { ClimbListItemContent } from '../../ClimbListItemContent';
import { THUMBNAIL_WIDTH } from '../../ClimbListThumbnail';
import { Icon } from '../../Icon';
import { PressableSurface } from '../../PressableSurface';
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
  /**
   * Dim + disable this row's refresh button while a *different* row is
   * regenerating. Refreshes run one at a time (the hook serializes them to avoid
   * clobbering each other's state), so this makes that constraint visible
   * instead of silently swallowing the tap.
   */
  refreshDisabled: boolean;
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
  refreshDisabled,
  onPress,
  onRefresh,
}: WorkoutPreviewRowProps) {
  const { systemColors, brandColors, opacity } = useTheme();
  const { t } = useTranslation('session');
  // Blocked while this row spins, or while another row holds the single refresh
  // slot. Only this row shows a spinner; the rest dim to read as "busy, wait".
  const refreshBlocked = isRefreshing || refreshDisabled;
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
      <View
        style={[
          styles.row,
          { backgroundColor: systemColors.secondaryBackground },
          isActive && { backgroundColor: `${brandColors.primary}14` },
        ]}
      >
        <PressableSurface
          onPress={handlePress}
          feedback="opacity"
          accessibilityRole="button"
          accessibilityLabel={climbName}
          accessibilityState={{ selected: isActive }}
          style={styles.rowButton}
        >
          <ClimbListItemContent
            climb={item.climb}
            boardName={board.boardName}
            layoutId={board.layoutId}
            sizeId={board.sizeId}
            setIds={board.setIds}
            angle={board.angle}
          />
        </PressableSurface>

        <PressableSurface
          onPress={handleRefresh}
          disabled={refreshBlocked}
          feedback="scale"
          hitSlop={2}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.session.preRegenerateClimbForClimb', { name: climbName })}
          accessibilityState={{ disabled: refreshBlocked, busy: isRefreshing }}
          style={[styles.refreshButton, refreshDisabled && !isRefreshing ? { opacity: opacity.disabled } : null]}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={iosSystemColors.systemGray} />
          ) : (
            <Icon name="refresh" size={22} color={iosSystemColors.systemGray} />
          )}
        </PressableSurface>
      </View>

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
    prev.refreshDisabled === next.refreshDisabled &&
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
    paddingHorizontal: spacing[3],
  },
  rowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing[3],
    paddingVertical: spacing[2],
  },
  refreshButton: {
    width: 44,
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
