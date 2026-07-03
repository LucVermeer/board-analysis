// Pure, node-testable press logic shared by both platform Button files. Keeping
// the guard + haptic here means the iOS and Android components can't drift on
// "what happens on tap", and it can be unit-tested without mounting a native
// @expo/ui tree. Mirrors SwitchRow.logic.ts.

import type { ViewStyle } from 'react-native';
import { hapticLight } from '../lib/haptics';

/**
 * Whether a Button's `style` asks it to fill its row's width. Only a POSITIVE
 * numeric `flex` grows — `flex: 0` means "don't grow", so it must not count
 * (`style.flex != null` would wrongly catch 0 and stretch the button). Shared by
 * both platform files so the iOS `frame({ maxWidth: Infinity })` and the Android
 * `fillMaxWidth()` stay in lockstep, and node-testable without a native tree.
 */
export function isFullWidthStyle(style: ViewStyle | undefined): boolean {
  return (
    style?.width === '100%' || (typeof style?.flex === 'number' && style.flex > 0) || style?.alignSelf === 'stretch'
  );
}

/**
 * Build the press handler used by both platform Button implementations: fires a
 * light haptic (unless `haptic` is false) then `onPress` — unless `disabled` or
 * `loading`, in which case it's a no-op (no haptic, no callback).
 *
 * `fireHaptic` is injectable so the unit test can assert it fires without a native
 * haptics module; production call sites use the default `hapticLight`.
 */
export function makeButtonPressHandler(
  {
    onPress,
    disabled = false,
    loading = false,
    haptic = true,
  }: { onPress: () => void; disabled?: boolean; loading?: boolean; haptic?: boolean },
  fireHaptic: () => void = hapticLight,
): () => void {
  return () => {
    if (disabled || loading) return;
    if (haptic) fireHaptic();
    onPress();
  };
}
