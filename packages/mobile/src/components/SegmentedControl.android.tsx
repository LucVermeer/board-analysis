// SegmentedControl — Android implementation, real Jetpack Compose via
// @expo/ui/jetpack-compose.
//
// A Material 3 `SingleChoiceSegmentedButtonRow` of `SegmentedButton`s inside its
// own `Host`. Each button reports its selected state, fires the shared select
// handler on tap, and disables per-segment via `enabled` (the one place Android
// can do what iOS's segmented Picker can't). Brand selected-fill colour comes
// from `segmentedBrandColors`; the rest of the surface/label colours come from
// the Compose Material theme the Host sets up.
//
// One Host per control is intentional for now (SegmentedControl is used
// one-per-card). A later pass consolidates whole settings screens under one Host.
//
// `accessibilityLabel` (the group name, e.g. "Appearance") is deliberately NOT
// forwarded here. Material's `SingleChoiceSegmentedButtonRow` already exposes the
// row as a single-choice group and each `SegmentedButton.Label` is announced with
// its selected state, and every call site renders a visible `SectionHeader` above
// the control that names the group. Compose (via @expo/ui) exposes no
// `contentDescription`/group-label modifier, and wrapping the native Host in an
// RN `accessible` View would collapse the segments into one node — breaking
// per-segment selection. So the group label is carried by the heading, not the
// control. (iOS applies it via the Picker's `accessibilityLabel` modifier, which
// labels the group without hiding segments — hence the small, intentional
// cross-platform asymmetry.)

import { Host } from '@expo/ui';
import { SingleChoiceSegmentedButtonRow, SegmentedButton, Text } from '@expo/ui/jetpack-compose';
import { StyleSheet } from 'react-native';
import { useTheme } from '../providers/theme-provider';
import { segmentedBrandColors } from '../theme/expo-ui-modifiers';
import { makeSelectHandler } from './SegmentedControl.logic';
import type { SegmentedControlProps } from './SegmentedControl.types';

export function SegmentedControl<K extends string = string>({
  options,
  selectedKey,
  onSelect,
  disabledKeys,
}: SegmentedControlProps<K>) {
  const { brandColors } = useTheme();
  const handleSelect = makeSelectHandler(onSelect, disabledKeys);
  const colors = segmentedBrandColors(brandColors);

  return (
    // `matchContents={{ vertical: true }}` (NOT the boolean `matchContents`, which
    // sizes to content in BOTH axes): the Host must fill the parent's width so the
    // segmented row spans the card, while height still tracks content.
    <Host matchContents={{ vertical: true }} style={styles.host}>
      <SingleChoiceSegmentedButtonRow>
        {options.map((option) => (
          <SegmentedButton
            key={option.key}
            selected={option.key === selectedKey}
            onClick={() => handleSelect(option.key)}
            enabled={!disabledKeys?.has(option.key)}
            colors={colors}
          >
            {/* The label slot is a native composable SLOT, so its child must be a
                Compose view (a `Text`), not a raw string — a bare string doesn't
                render and isn't exposed to the a11y tree. Mirrors @expo/ui's own
                community SegmentedControl.android. */}
            <SegmentedButton.Label>
              <Text>{option.label}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
  },
});
