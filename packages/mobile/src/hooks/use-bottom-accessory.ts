import { Platform } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../providers/theme-provider';

/**
 * Whether the device *can* host `NativeTabs.BottomAccessory` — the pure
 * capability check (iOS 26 + RN ≥ 0.82). The native accessory is tied to the
 * system Liquid Glass tab bar, so it only exists on that path.
 */
export function isBottomAccessoryAvailable(): boolean {
  const reactNativeMinor = Platform.constants.reactNativeVersion?.minor ?? 0;
  return Platform.OS === 'ios' && reactNativeMinor >= 82 && isLiquidGlassAvailable();
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
