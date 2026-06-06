import { Platform } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

/**
 * Whether the app should use `NativeTabs.BottomAccessory` for the current climb
 * controls. Search lives in the top chrome, so the native accessory can now use
 * UIKit's single platter and inline/minimized behavior without nesting another
 * search/tick capsule inside it.
 */
export function isBottomAccessoryAvailable(): boolean {
  const reactNativeMinor = Platform.constants.reactNativeVersion?.minor ?? 0;
  return Platform.OS === 'ios' && reactNativeMinor >= 82 && isLiquidGlassAvailable();
}
