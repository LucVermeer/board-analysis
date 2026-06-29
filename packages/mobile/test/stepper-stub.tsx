// Test stub for the platform-split Stepper. Its iOS impl renders a native @expo/ui
// SwiftUI tree that can't mount under Vitest's node env, and Vitest doesn't resolve
// `.ios`/`.android` platform extensions, so any suite that transitively renders
// Stepper redirects here via a vite alias (see vite.config.ts).
//
// FAITHFUL PASSTHROUGH (not a null stub): it preserves the public API and the −/+
// button accessibility labels with plain RN primitives, so screen tests that render
// a Stepper keep their label / role assertions passing. Component tests that assert
// the real Android internals import the explicit `Stepper.android` impl, which
// bypasses this alias.

import { Pressable, Text, View } from 'react-native';
// The shared logic/types have no native imports, so they're safe to pull into the
// node-env stub — keeps the stub's contract from drifting from the real component.
import { clampStepperValue } from '../src/components/Stepper.logic';
import type { StepperProps } from '../src/components/Stepper.types';

export function Stepper({ label, value, min, max, onChange, decreaseLabel, increaseLabel }: StepperProps) {
  const update = (next: number) => onChange(clampStepperValue(next, min, max));
  return (
    <View>
      <Text>{label}</Text>
      <Text>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        disabled={value <= min}
        onPress={() => update(value - 1)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        disabled={value >= max}
        onPress={() => update(value + 1)}
      />
    </View>
  );
}
