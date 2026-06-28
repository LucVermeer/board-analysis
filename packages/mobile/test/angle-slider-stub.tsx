// Test stub for the platform-split AngleSlider. Its iOS / Android implementations
// render native @expo/ui Slider trees (SwiftUI / Compose) that can't mount under
// Vitest's node env, and Vitest doesn't resolve `.ios`/`.android` platform
// extensions, so any suite that transitively renders an AngleSlider redirects here
// via a vite alias (see vite.config.ts). AngleSlider lives in
// src/components/play-drawer/, so the type import path differs from the
// SwitchRow / SegmentedControl stubs.
//
// This is a FAITHFUL PASSTHROUGH (not a null stub): it preserves the public API
// and the `adjustable` accessibility semantics with plain React Native
// primitives, exposing the current value and increment/decrement controls that
// step `onChange` to a neighbouring angle — so indirect screen tests that render
// an AngleSlider keep their assertions passing. Component tests that assert
// AngleSlider internals register their own vi.mock, which takes precedence.

import { Pressable, Text, View } from 'react-native';
// The shared props type has no native imports, so it's safe to pull into the
// node-env stub — keeps the stub's contract from drifting from the real component.
import type { AngleSliderProps } from '../src/components/play-drawer/AngleSlider.types';

export function AngleSlider({ angles, value, onChange }: AngleSliderProps) {
  // indexOf(-1) -> Math.max(0, -1) === 0: an unknown value falls back to the
  // first stop, matching sliderIndexForAngle.
  const valueIndex = Math.max(0, angles.indexOf(value));
  const emit = (index: number) => {
    const angle = angles[Math.max(0, Math.min(angles.length - 1, index))];
    if (angle !== undefined) onChange(angle);
  };

  return (
    <View accessibilityRole="adjustable" accessibilityValue={{ text: `${value}°` }}>
      <Pressable accessibilityRole="button" accessibilityLabel="decrement" onPress={() => emit(valueIndex - 1)}>
        <Text>−</Text>
      </Pressable>
      <Text>{value}°</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="increment" onPress={() => emit(valueIndex + 1)}>
        <Text>+</Text>
      </Pressable>
    </View>
  );
}
