// SegmentedControl — iOS implementation, real SwiftUI via @expo/ui/swift-ui.
//
// A single SwiftUI `Picker` in the `segmented` style (the native iOS segmented
// control) inside its own `Host`. Each option is a `Text` child carrying a `tag`
// modifier so SwiftUI maps selection to the option key; the segment styling, tap
// targets, and selection animation come from the platform. We only bridge the
// brand tint and the group accessibility label via modifiers.
//
// iOS limitation: a SwiftUI segmented Picker has no per-segment disable. So a
// `disabledKeys` entry can't be greyed out individually here — instead the shared
// select handler ignores a tap on a disabled key (Android's SegmentedButton DOES
// disable per-segment via `enabled`). `disabledKeys` is effectively unused on the
// remaining call sites, so this is a graceful degrade, not a regression.
//
// One Host per control is intentional for now (SegmentedControl is used
// one-per-card). A later pass consolidates whole settings screens under one Host.

import { Host } from '@expo/ui';
import { Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tint, tag, accessibilityLabel as accessibilityLabelModifier } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';
import { useTheme } from '../providers/theme-provider';
import { brandAccentColor } from '../theme/expo-ui-modifiers';
import { makeSelectHandler } from './SegmentedControl.logic';
import type { SegmentedControlProps } from './SegmentedControl.types';

export function SegmentedControl<K extends string = string>({
  options,
  selectedKey,
  onSelect,
  disabledKeys,
  accessibilityLabel,
}: SegmentedControlProps<K>) {
  const { brandColors } = useTheme();
  const handleSelect = makeSelectHandler(onSelect, disabledKeys);

  return (
    // minHeight floors the row in RN's layout: the native iOS Host (matchContents
    // vertical) under-reports the segmented Picker's height to React Native, so
    // without a floor the control collapses and the content below it (e.g. the
    // sort buttons under "Order") rides up over it.
    <Host matchContents={{ vertical: true }} style={[styles.host, styles.minRow]}>
      <Picker
        selection={selectedKey}
        onSelectionChange={(value) => {
          // @expo/ui types the selection as the untyped Picker tag; our tags are
          // always the string option keys, so guard rather than blind-cast (a
          // non-string would otherwise slip through).
          if (typeof value !== 'string') return;
          handleSelect(value as K);
        }}
        modifiers={[
          pickerStyle('segmented'),
          // Brand selected-fill tint, sourced once via the theming bridge.
          tint(brandAccentColor(brandColors)),
          // Name the group for VoiceOver (the per-segment Text children stay the
          // individual labels). Skipped when no label is provided.
          ...(accessibilityLabel ? [accessibilityLabelModifier(accessibilityLabel)] : []),
        ]}
      >
        {options.map((option) => (
          <Text key={option.key} modifiers={[tag(option.key)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
  },
  // iOS segmented control sits ~32pt; 44 gives a comfortable, non-collapsing row.
  minRow: {
    minHeight: 44,
  },
});
