// Shared props for the platform-split SegmentedControl. The implementation is
// split across SegmentedControl.ios.tsx (native @expo/ui SwiftUI segmented
// Picker) and SegmentedControl.android.tsx (native @expo/ui Jetpack Compose
// SingleChoiceSegmentedButtonRow). The split keeps each platform's @expo/ui
// native tree — which resolves native views at module load — off the other
// platform's bundle. The public API is identical to the previous
// react-native-paper / Liquid-Glass implementation, so every call site is
// unchanged.

import type { ColorValue } from 'react-native';

export type SegmentOption<K extends string> = {
  key: K;
  label: string;
};

export type SegmentedControlProps<K extends string = string> = {
  options: SegmentOption<K>[];
  selectedKey: K;
  onSelect: (key: K) => void;
  /**
   * @deprecated Ignored by the native segmented controls (they size their own
   * labels). A Liquid-Glass-era styling lever, optional and kept only so existing
   * call sites compile unchanged. Don't pass it in new code.
   */
  textVariant?: 'subheadline' | 'footnote';
  /**
   * @deprecated Ignored by the native segmented controls (they read the system
   * surface). A Liquid-Glass-era styling lever, optional and kept only so existing
   * call sites compile unchanged. Don't pass it in new code.
   */
  trackColor?: ColorValue;
  /** Keys that render dimmed and non-selectable. */
  disabledKeys?: ReadonlySet<K>;
  /** Accessibility label naming the group (e.g. "Appearance"), so the platform announces what the segments control. */
  accessibilityLabel?: string;
};
