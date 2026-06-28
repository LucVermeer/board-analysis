// Test stub for the platform-split SegmentedControl. Its iOS / Android
// implementations render native @expo/ui trees (a SwiftUI segmented Picker /
// Compose SingleChoiceSegmentedButtonRow) that can't mount under Vitest's node
// env, and Vitest doesn't resolve `.ios`/`.android` platform extensions, so any
// suite that transitively renders a SegmentedControl redirects here via a vite
// alias (see vite.config.ts).
//
// This is a FAITHFUL PASSTHROUGH (not a null stub): it preserves the public API
// and the `radio`/`radiogroup` accessibility semantics with plain React Native
// primitives, so the indirect screen tests that render a SegmentedControl keep
// their label / role assertions passing unchanged. Component tests that assert
// SegmentedControl internals register their own vi.mock, which takes precedence
// over this alias.

import { Pressable, Text, View } from 'react-native';
// The shared props type has no native imports, so it's safe to pull into the
// node-env stub — keeps the stub's contract from drifting from the real component.
import type { SegmentedControlProps } from '../src/components/SegmentedControl.types';

export function SegmentedControl<K extends string = string>({
  options,
  selectedKey,
  onSelect,
  disabledKeys,
  accessibilityLabel,
}: SegmentedControlProps<K>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const disabled = disabledKeys?.has(option.key) ?? false;
        const selected = option.key === selectedKey;
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              if (disabled) return;
              onSelect(option.key);
            }}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.label}
          >
            <Text>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
