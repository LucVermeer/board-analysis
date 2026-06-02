// Bottom-sheet wrapper around QuickTickBar. Used by every ticking entry
// point — the play drawer's tick button, the persistent queue bar, the
// climb detail screen — so the form, dismissal model (handle + pan-down +
// backdrop tap), and keyboard handling stay identical across surfaces.
//
// Uses `BottomSheetModal` (not the regular `BottomSheet`) so it renders in
// a portal above the play drawer's own modal. `FullWindowOverlay` on iOS
// lifts the sheet above the tab bar — same pattern as DevicePickerSheet.
import { useCallback, useEffect, useMemo, useRef, type PropsWithChildren } from 'react';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useTheme } from '../providers/theme-provider';
import { iosSystemColors } from '../theme/ios-colors';
import { QuickTickBar } from './play-drawer/QuickTickBar';

type LogAscentSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  climbUuid: string;
  climbName?: string;
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

function LogAscentModalContainer({ children }: PropsWithChildren) {
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}

const modalContainerComponent = Platform.OS === 'ios' ? LogAscentModalContainer : undefined;

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
  const { systemColors } = useTheme();

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  // 60% leaves the climb image visible above the sheet — the UX review
  // flagged the previous full-cover behaviour (with carousel disabled) as
  // the wrong tradeoff: users want to glance at the holds while logging.
  const snapPoints = useMemo(() => ['60%'], []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} pressBehavior="close" />
    ),
    [],
  );

  const backgroundStyle: ViewStyle = {
    backgroundColor: systemColors.secondaryBackground as string,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      name="log-ascent"
      index={0}
      stackBehavior="push"
      snapPoints={snapPoints}
      containerComponent={modalContainerComponent}
      enablePanDownToClose
      onDismiss={onDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={backgroundStyle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetView style={styles.content}>
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
      </BottomSheetView>
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
});
