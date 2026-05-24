import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Platform, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { QueueSheetHeader } from './QueueSheetHeader';
import { QueueList, type QueueListHandle } from './QueueList';
import { Text } from '../Text';
import { useQueue } from '../../providers/queue-provider';
import { hapticMedium, hapticWarning } from '../../lib/haptics';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type QueueSheetProps = {
  visible: boolean;
  onClose: () => void;
  onClimbPress: (item: ClimbQueueItem) => void;
};

export function QueueSheet({ visible, onClose, onClimbPress }: QueueSheetProps) {
  const { t } = useTranslation('session');
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<QueueListHandle>(null);

  const { state, removeFromQueue } = useQueue();
  const { queue, currentClimbQueueItem } = state;

  const [isEditMode, setIsEditMode] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const snapPoints = useMemo(() => ['60%', '90%'], []);

  const currentClimbUuid = currentClimbQueueItem?.climb.uuid ?? null;

  // Open/close the sheet based on visible prop
  useEffect(() => {
    if (visible) {
      sheetRef.current?.snapToIndex(0);
      // Scroll to current climb after opening
      setTimeout(() => {
        listRef.current?.scrollToCurrentClimb();
      }, 400);
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  const resetState = useCallback(() => {
    setIsEditMode(false);
    setSelectedItems(new Set());
    setShowFullHistory(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index < 0) {
        handleClose();
      }
    },
    [handleClose],
  );

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode((prev) => {
      if (prev) {
        // Exiting edit mode — clear selection
        setSelectedItems(new Set());
      }
      return !prev;
    });
  }, []);

  const handleToggleHistory = useCallback(() => {
    setShowHistory((prev) => !prev);
  }, []);

  const handleShowFullHistory = useCallback(() => {
    setShowFullHistory(true);
  }, []);

  const handleToggleSelect = useCallback((uuid: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  const handleClearAll = useCallback(() => {
    hapticWarning();
    for (const item of queue) {
      removeFromQueue(item.uuid);
    }
    setIsEditMode(false);
    setSelectedItems(new Set());
  }, [queue, removeFromQueue]);

  const handleBulkRemove = useCallback(() => {
    hapticMedium();
    for (const uuid of selectedItems) {
      removeFromQueue(uuid);
    }
    setSelectedItems(new Set());
    setIsEditMode(false);
  }, [selectedItems, removeFromQueue]);

  const handleRemove = useCallback(
    (uuid: string) => {
      removeFromQueue(uuid);
    },
    [removeFromQueue],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const viewOnlyMode = queue.length === 0;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onChange={handleSheetChange}
      onClose={handleClose}
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={styles.background}
      style={styles.sheet}
    >
      <QueueSheetHeader
        isEditMode={isEditMode}
        showHistory={showHistory}
        selectedCount={selectedItems.size}
        queueCount={queue.length}
        viewOnlyMode={viewOnlyMode}
        onToggleEditMode={handleToggleEditMode}
        onToggleHistory={handleToggleHistory}
        onClose={handleClose}
        onClearAll={handleClearAll}
      />

      <QueueList
        ref={listRef}
        queue={queue}
        currentClimbUuid={currentClimbUuid}
        isEditMode={isEditMode}
        showHistory={showHistory}
        showFullHistory={showFullHistory}
        selectedItems={selectedItems}
        onToggleSelect={handleToggleSelect}
        onClimbPress={onClimbPress}
        onRemove={handleRemove}
        onShowFullHistory={handleShowFullHistory}
      />

      {/* Bulk remove bar */}
      {isEditMode && selectedItems.size > 0 && (
        <View style={[styles.bulkBar, { paddingBottom: insets.bottom + spacing[3] }]}>
          <Pressable
            onPress={handleBulkRemove}
            accessibilityRole="button"
            accessibilityLabel={t('queueDrawer.removeItems', { count: selectedItems.size })}
            style={styles.bulkButton}
          >
            <Text variant="headline" color={iosSystemColors.white}>
              {t('queueDrawer.removeItems', { count: selectedItems.size })}
            </Text>
          </Pressable>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  indicator: {
    backgroundColor: 'rgba(60, 60, 67, 0.3)',
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  background: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  bulkBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: iosSystemColors.separator,
  },
  bulkButton: {
    backgroundColor: brandColors.error,
    borderRadius: 12,
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
