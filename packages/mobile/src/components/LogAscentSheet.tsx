// Bottom-sheet wrapper around QuickTickBar. Used by every ticking entry
// point — the play drawer's tick button, the persistent queue bar, the
// climb detail screen — so the form, dismissal model (handle + pan-down +
// native scrim tap), and keyboard handling stay identical across surfaces.
//
// Uses `BottomSheetModal` (not the regular `BottomSheet`) so it presents as
// a native modal above the play drawer's own modal.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheetModal } from '@expo/ui/community/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../providers/theme-provider';
import { iosSystemColors } from '../theme/ios-colors';
import { spacing } from '../theme/tokens';
import { Icon } from './Icon';
import { QuickTickBar } from './play-drawer/QuickTickBar';

type LogAscentSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  climbUuid: string;
  boardName: string;
  angle: number;
  isMirror: boolean;
  isBenchmark: boolean;
  layoutId?: number;
  sizeId?: number;
  setIds?: string;
  sessionId?: string | null;
  consensusGradeName?: string;
};

export function LogAscentSheet({
  visible,
  onDismiss,
  climbUuid,
  boardName,
  angle,
  isMirror,
  isBenchmark,
  layoutId,
  sizeId,
  setIds,
  sessionId,
  consensusGradeName,
}: LogAscentSheetProps) {
  const sheetRef = useRef<BottomSheetModal>(null);
  // Tracks whether the modal is currently *presented*, independent of the
  // external `visible` prop, so we never call `dismiss()` on an already-closed
  // sheet (or `present()` on an already-open one) when a pan-down dismiss and
  // our `visible` effect race.
  const isPresentedRef = useRef(false);
  const { systemColors } = useTheme();
  const { t } = useTranslation('session');

  useEffect(() => {
    if (visible && !isPresentedRef.current) {
      sheetRef.current?.present();
      isPresentedRef.current = true;
    } else if (!visible && isPresentedRef.current) {
      sheetRef.current?.dismiss();
      isPresentedRef.current = false;
    }
  }, [visible]);

  const handleSheetDismiss = useCallback(() => {
    isPresentedRef.current = false;
    onDismiss();
  }, [onDismiss]);

  // Default to 60% so the climb image stays visible above the sheet (the
  // UX review flagged full-cover + carousel-disabled as the wrong
  // tradeoff). The 92% snap is the keyboard-extended state; the native sheet
  // keeps the focused input and save buttons above the keyboard.
  const snapPoints = useMemo(() => ['60%', '92%'], []);

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      onDismiss={handleSheetDismiss}
      handleIndicatorStyle={styles.indicator}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
    >
      <View style={styles.content}>
        <View style={styles.closeButtonRow}>
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('playView.tickBar.closeAria')}
            hitSlop={8}
            style={({ pressed }) => [
              styles.closeButton,
              { backgroundColor: systemColors.fill },
              pressed && styles.closeButtonPressed,
            ]}
          >
            <Icon name="chevron.down" size={18} color={systemColors.secondaryLabel} />
          </Pressable>
        </View>
        <QuickTickBar
          climbUuid={climbUuid}
          boardName={boardName}
          angle={angle}
          isMirror={isMirror}
          isBenchmark={isBenchmark}
          layoutId={layoutId}
          sizeId={sizeId}
          setIds={setIds}
          sessionId={sessionId}
          consensusGradeName={consensusGradeName}
          onDismiss={onDismiss}
        />
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  indicator: {
    backgroundColor: iosSystemColors.separator,
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  content: {
    flex: 1,
  },
  closeButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[1],
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonPressed: {
    opacity: 0.7,
  },
});
