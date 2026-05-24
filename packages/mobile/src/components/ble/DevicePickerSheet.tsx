import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { parseBoardTypeFromDeviceName } from '@boardsesh/ble-protocol';
import type { DiscoveredDevice } from '../../lib/ble/types';
import { Text } from '../Text';
import { Button } from '../Button';
import { DeviceCard } from './DeviceCard';
import { useTheme } from '../../providers/theme-provider';
import { spacing } from '../../theme/tokens';

type DevicePickerSheetProps = {
  visible: boolean;
  devices: DiscoveredDevice[];
  onSelect: (deviceId: string) => void;
  onDismiss: () => void;
  isScanning: boolean;
};

export function DevicePickerSheet({ visible, devices, onSelect, onDismiss, isScanning }: DevicePickerSheetProps) {
  const { t } = useTranslation('settings');
  const theme = useTheme();
  const sheetRef = useRef<BottomSheet>(null);

  const snapPoints = useMemo(() => ['55%'], []);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.expand();
    }
  }, [visible]);

  const sortedDevices = useMemo(() => [...devices].sort((deviceA, deviceB) => deviceB.rssi - deviceA.rssi), [devices]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...backdropProps} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const renderDeviceItem = useCallback(
    ({ item }: { item: DiscoveredDevice }) => {
      const boardType = parseBoardTypeFromDeviceName(item.name);
      const boardLabel = boardType ? boardType.charAt(0).toUpperCase() + boardType.slice(1) : undefined;

      return <DeviceCard device={item} onSelect={onSelect} boardType={boardLabel} />;
    },
    [onSelect],
  );

  const keyExtractor = useCallback((item: DiscoveredDevice) => item.deviceId, []);

  const { systemColors } = theme;

  const backgroundStyle: ViewStyle = {
    backgroundColor: systemColors.secondaryBackground as string,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  };

  if (!visible) return null;

  const showScanningState = isScanning && devices.length === 0;
  const showEmptyState = !isScanning && devices.length === 0;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onChange={handleSheetChange}
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={backgroundStyle}
    >
      <BottomSheetView style={styles.header}>
        <Text variant="title3" color={systemColors.label}>
          {t('settings.ble.selectBoard')}
        </Text>
        {devices.length > 0 && (
          <Text variant="footnote" color={systemColors.secondaryLabel}>
            {t('settings.ble.devicesFound', { count: devices.length })}
          </Text>
        )}
      </BottomSheetView>

      {showScanningState && (
        <View style={styles.scanningContainer}>
          <ActivityIndicator size="small" color={theme.brandColors.primary} />
          <Text variant="subheadline" color={systemColors.secondaryLabel}>
            {t('settings.ble.scanning')}
          </Text>
        </View>
      )}

      {showEmptyState && (
        <View style={styles.scanningContainer}>
          <Text variant="subheadline" color={systemColors.secondaryLabel}>
            {t('settings.ble.noDevicesFound')}
          </Text>
        </View>
      )}

      {devices.length > 0 && (
        <BottomSheetFlatList
          data={sortedDevices}
          keyExtractor={keyExtractor}
          renderItem={renderDeviceItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.footer}>
        <Button title={t('settings.ble.cancel')} onPress={onDismiss} variant="text" size="medium" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  indicator: {
    backgroundColor: 'rgba(60, 60, 67, 0.3)',
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    alignItems: 'center',
    gap: 4,
  },
  scanningContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingVertical: spacing[10],
  },
  listContent: {
    paddingHorizontal: spacing[2],
    paddingBottom: spacing[4],
    gap: spacing[1],
  },
  footer: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
});
