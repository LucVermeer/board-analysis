// Stepper — iOS implementation, real SwiftUI via @expo/ui/swift-ui.
//
// A single SwiftUI `Stepper` (the native iOS −/+ capsule) inside its own `Host`.
// The native control adds press-and-hold-to-repeat, the system increment "tick"
// haptic, and the adjustable VoiceOver trait — none of which the custom RN pill had.
//
// SwiftUI `Stepper(label:)` renders only the label + the capsule (no separate value
// readout the way the old custom control did), so the current value is folded into
// the label text ("Main-set climbs   12"). The native control enforces min/max (the
// matching button disables at the bound); we still clamp the reported value through
// the shared logic so iOS and Android can't drift.
//
// One Host per row mirrors SwitchRow: the RN `GroupedSteppers` wrapper in
// GeneratorPickerCard supplies the inset-card chrome + hairline dividers, exactly as
// it wraps native Toggle rows today.

import { Host } from '@expo/ui';
import { Stepper as SwiftUIStepper } from '@expo/ui/swift-ui';
import { tint, padding } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';
import { useTheme } from '../providers/theme-provider';
import { brandAccentColor } from '../theme/expo-ui-modifiers';
import { spacing } from '../theme/tokens';
import { clampStepperValue } from './Stepper.logic';
import type { StepperProps } from './Stepper.types';

// Floor the host height in RN's layout. The native iOS Host (matchContents vertical)
// under-reports the Stepper's intrinsic height to React Native, so without a floor a
// row renders shorter than its content and the grouped card's hairline dividers
// crowd the capsule. Mirrors SwitchRow.ios.tsx's ROW_MIN_HEIGHT.
const ROW_MIN_HEIGHT = 44;

export function Stepper({ label, value, min, max, onChange }: StepperProps) {
  const { brandColors, colorScheme } = useTheme();

  return (
    <Host
      matchContents={{ vertical: true }}
      // Force the native appearance to follow the in-app Light/Dark scheme, matching
      // the other native primitives' Hosts.
      colorScheme={colorScheme}
      style={[styles.host, { minHeight: ROW_MIN_HEIGHT }]}
    >
      <SwiftUIStepper
        // The native Stepper has no separate value readout — fold the value into the
        // label so the row still shows the current count.
        label={`${label}   ${value}`}
        value={value}
        min={min}
        max={max}
        step={1}
        onValueChange={(next) => onChange(clampStepperValue(next, min, max))}
        modifiers={[
          // Inset the row so the trailing capsule isn't flush with the container's
          // right edge — matches the old row's paddingHorizontal and the SwitchRow
          // padding.
          padding({ horizontal: spacing[4], vertical: spacing[2] }),
          // Brand accent on the −/+ capsule, sourced once via the theming bridge.
          tint(brandAccentColor(brandColors)),
        ]}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
  },
});
