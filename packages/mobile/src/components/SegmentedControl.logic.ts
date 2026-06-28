// Pure, node-testable selection logic shared by both platform SegmentedControl
// files. Keeping the haptic + disabled guard here means the iOS and Android
// components can't drift on "what happens when you tap a segment", and it can be
// unit-tested without mounting a native @expo/ui tree.

import { hapticSelection } from '../lib/haptics';

/**
 * Build the select handler used by both platform SegmentedControl
 * implementations. Fires a selection haptic, then `onSelect` with the chosen
 * key — unless the key is in `disabledKeys`, in which case it's a no-op (no
 * haptic, no callback).
 *
 * `haptic` is injectable so the unit test can assert it fires without a native
 * haptics module; production call sites use the default `hapticSelection`.
 *
 * @returns a `(key: K) => void` handler. iOS feeds the segmented Picker's tag
 * value straight in (after a string guard); Android calls it from each
 * SegmentedButton's `onClick`.
 */
export function makeSelectHandler<K extends string>(
  onSelect: (key: K) => void,
  disabledKeys?: ReadonlySet<K>,
  haptic: () => void = hapticSelection,
): (key: K) => void {
  return (key: K) => {
    if (disabledKeys?.has(key)) return;
    haptic();
    onSelect(key);
  };
}
