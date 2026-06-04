import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { ListRow } from '../ListRow';
import { Icon } from '../Icon';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type BleControlSheetProps = {
  visible: boolean;
  /** Re-push the current climb to the wall (same as a lightbulb tap). */
  onReassert: () => void;
  /** Drop the BLE connection. */
  onDisconnect: () => void;
  onClose: () => void;
};

// Secondary BLE controls (Re-light / Disconnect) revealed by long-pressing the
// lightbulb — keeps the destructive Disconnect behind a labelled menu.
function BleControlSheet({ visible, onReassert, onDisconnect, onClose }: BleControlSheetProps) {
  const { t: tSettings } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  const handleReassert = useCallback(() => {
    onReassert();
    onClose();
  }, [onReassert, onClose]);

  const handleDisconnect = useCallback(() => {
    onDisconnect();
    onClose();
  }, [onDisconnect, onClose]);

  const snapPoints = useMemo(() => ['25%'], []);

  return (
    <Sheet ref={sheetRef} snapPoints={snapPoints} onClose={onClose} enablePanDownToClose>
      <View style={styles.content}>
        <ListRow
          title={tSettings('ble.relightBoard')}
          leading={<Icon name="lightbulb.fill" size={22} color={brandColors.warning} />}
          onPress={handleReassert}
          showSeparator
        />
        <ListRow
          title={tCommon('lightControl.disconnect')}
          leading={<Icon name="bluetooth.off" size={22} color={iosSystemColors.systemRed} />}
          onPress={handleDisconnect}
          showSeparator={false}
        />
      </View>
    </Sheet>
  );
}

export { BleControlSheet };

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing[2],
  },
});
