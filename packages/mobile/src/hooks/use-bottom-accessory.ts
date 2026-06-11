import { Platform } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '../providers/theme-provider';

/**
 * Whether the device *can* host `NativeTabs.BottomAccessory` — the pure
 * capability check. The native accessory is tied to the system Liquid Glass tab
 * bar, so it only exists on that path.
 */
export function isBottomAccessoryAvailable(): boolean {
  return Platform.OS === 'ios' && NativeTabs?.BottomAccessory != null && isLiquidGlassAvailable();
}

/**
 * Whether the native bottom accessory is actually in use right now: the device
 * supports it AND the user is on the Liquid Glass variant. On the Material
 * variant the JS tab bar replaces `NativeTabs`, so the current climb + tick ride
 * the floating `PersistentQueueBar` instead and this returns false.
 */
export function useNativeAccessoryActive(): boolean {
  const { variant } = useTheme();
  return variant === 'liquidGlass' && isBottomAccessoryAvailable();
}
