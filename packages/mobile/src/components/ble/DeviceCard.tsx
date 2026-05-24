import { useCallback } from 'react';
import { View, Pressable, StyleSheet, type ColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { DiscoveredDevice } from '../../lib/ble/types';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { hapticLight } from '../../lib/haptics';
import { spacing, borderRadius } from '../../theme/tokens';
import { iosSystemColors } from '../../theme/ios-colors';
import { parseSerialNumber } from '@boardsesh/ble-protocol';

type RssiStrength = 'strong' | 'good' | 'weak';

function classifyRssi(rssi: number): RssiStrength {
  if (rssi > -60) return 'strong';
  if (rssi > -80) return 'good';
  return 'weak';
}

const rssiBarColor: Record<RssiStrength, string> = {
  strong: iosSystemColors.systemGreen,
  good: iosSystemColors.systemYellow,
  weak: iosSystemColors.systemRed,
};

function RssiIndicator({ rssi }: { rssi: number }) {
  const strength = classifyRssi(rssi);
  const activeColor = rssiBarColor[strength];
  const inactiveColor = 'rgba(120, 120, 128, 0.2)';

  const barHeights = [8, 13, 18];
  const activeBars = strength === 'strong' ? 3 : strength === 'good' ? 2 : 1;

  return (
    <View style={styles.rssiContainer}>
      {barHeights.map((height, index) => (
        <View
          key={index}
          style={[
            styles.rssiBar,
            {
              height,
              backgroundColor: index < activeBars ? activeColor : inactiveColor,
            },
          ]}
        />
      ))}
    </View>
  );
}

type DeviceCardProps = {
  device: DiscoveredDevice;
  onSelect: (deviceId: string) => void;
  boardType?: string;
};

export function DeviceCard({ device, onSelect, boardType }: DeviceCardProps) {
  const { t } = useTranslation('settings');
  const { systemColors, brandColors: themeBrandColors } = useTheme();
  const serialNumber = parseSerialNumber(device.name);

  const handlePress = useCallback(() => {
    hapticLight();
    onSelect(device.deviceId);
  }, [device.deviceId, onSelect]);

  const displayName = device.name ?? t('settings.ble.unknownBoard');

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={displayName}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: (pressed ? systemColors.fill : systemColors.secondaryBackground) as string,
        },
      ]}
    >
      <View style={styles.leftSection}>
        <Icon name="bluetooth" size={22} color={themeBrandColors.primary} />
      </View>

      <View style={styles.centerSection}>
        <Text variant="body" color={systemColors.label as ColorValue} numberOfLines={1}>
          {displayName}
        </Text>

        <View style={styles.metaRow}>
          {boardType && (
            <View style={[styles.badge, { backgroundColor: systemColors.fill as string }]}>
              <Text variant="caption2" color={systemColors.secondaryLabel as ColorValue}>
                {boardType}
              </Text>
            </View>
          )}
          {serialNumber && (
            <Text variant="caption1" color={systemColors.tertiaryLabel as ColorValue} numberOfLines={1}>
              #{serialNumber}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.rightSection}>
        <RssiIndicator rssi={device.rssi} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    gap: spacing[3],
  },
  leftSection: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSection: {
    flex: 1,
    gap: spacing[1],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  badge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  rightSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rssiContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 18,
  },
  rssiBar: {
    width: 4,
    borderRadius: 1,
  },
});
