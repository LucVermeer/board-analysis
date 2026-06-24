import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import type { BottomSheetMethods } from '@expo/ui/community/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { ModalSheet } from '../ModalSheet';
import { ListRow } from '../ListRow';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type BleControlSheetProps = {
  visible: boolean;
  /** Re-push the current climb to the wall (same as a lightbulb tap). */
  onReassert: () => void;
  /** Clear every LED on the wall, keeping the connection alive. */
  onClearLights: () => void;
  /**
   * Whether the connected board can encode a clear-all frame. MoonBoard's
   * protocol has no "clear" packet (an empty frame is a deliberate no-op in
   * sendFramesToBoard, matching web), so the row is hidden rather than left
   * as a silent dead tap.
   */
  supportsClearLights: boolean;
  /** Drop the BLE connection. */
  onDisconnect: () => void;
  onClose: () => void;
};

// Secondary BLE controls (Re-light / Turn off all lights / Disconnect) revealed
// by long-pressing the lightbulb — keeps the destructive Disconnect behind a
// labelled menu.
function BleControlSheet({
  visible,
  onReassert,
  onClearLights,
  supportsClearLights,
  onDisconnect,
  onClose,
}: BleControlSheetProps) {
  const { t: tSettings } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { brandColors, systemColors } = useTheme();
  const sheetRef = useRef<BottomSheetMethods>(null);
  // Present/dismiss imperatively via ModalSheet (BottomSheetModal): it presents as
  // its OWN modal view controller so it stacks ABOVE the play route. The old
  // declarative `Sheet` (regular BottomSheet) presented inline and dismissed the
  // route instead. The presented-state guard avoids dismiss()-ing a not-presented
  // modal (which would wedge present() — the "nothing happens" bug).
  const isPresentedRef = useRef(false);
  useEffect(() => {
    if (visible && !isPresentedRef.current) {
      sheetRef.current?.present();
      isPresentedRef.current = true;
    } else if (!visible && isPresentedRef.current) {
      sheetRef.current?.dismiss();
      isPresentedRef.current = false;
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    isPresentedRef.current = false;
    onClose();
  }, [onClose]);

  const handleReassert = useCallback(() => {
    onReassert();
    onClose();
  }, [onReassert, onClose]);

  const handleClearLights = useCallback(() => {
    onClearLights();
    onClose();
  }, [onClearLights, onClose]);

  const handleDisconnect = useCallback(() => {
    onDisconnect();
    onClose();
  }, [onDisconnect, onClose]);

  const snapPoints = useMemo(() => ['32%'], []);

  return (
    <ModalSheet ref={sheetRef} snapPoints={snapPoints} onDismiss={handleDismiss} enablePanDownToClose>
      <View style={styles.content}>
        <ListRow
          title={tSettings('ble.relightBoard')}
          leading={<Icon name="lightbulb.fill" size={22} color={brandColors.warning} />}
          onPress={handleReassert}
          showSeparator
        />
        {supportsClearLights && (
          <ListRow
            title={tCommon('lightControl.turnOffAll')}
            leading={<Icon name="lightbulb.slash" size={22} color={systemColors.secondaryLabel} />}
            onPress={handleClearLights}
            showSeparator
          />
        )}
        <ListRow
          title={tCommon('lightControl.disconnect')}
          leading={<Icon name="bluetooth.off" size={22} color={iosSystemColors.systemRed} />}
          onPress={handleDisconnect}
          showSeparator={false}
        />
      </View>
    </ModalSheet>
  );
}

export { BleControlSheet };

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing[2],
  },
});
