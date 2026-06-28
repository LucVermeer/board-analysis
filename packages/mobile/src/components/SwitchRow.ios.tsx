// SwitchRow — iOS implementation, real SwiftUI via @expo/ui/swift-ui.
//
// A single SwiftUI `Toggle` (the native iOS switch) inside its own `Host`. The
// Toggle's two `Text` children are its title + subtitle — SwiftUI renders the
// second as secondary automatically, so the label/description styling, ≥44pt tap
// target, switch accessibility trait, and on/off announcement all come from the
// platform for free. We only bridge the brand on-track tint and the disabled
// state via modifiers.
//
// One Host per row is intentional for PR-1 (SwitchRow is used one-per-card
// today). PR-2 consolidates whole settings screens into a single SwiftUI Form.

import { Host } from '@expo/ui';
import { Toggle, Text } from '@expo/ui/swift-ui';
import { tint, disabled as disabledModifier } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';
import { useTheme } from '../providers/theme-provider';
import { brandAccentColor } from '../theme/expo-ui-modifiers';
import { makeToggleHandler } from './SwitchRow.logic';
import type { SwitchRowProps } from './SwitchRow.types';

export function SwitchRow({ label, description, value, onValueChange, disabled = false }: SwitchRowProps) {
  const { brandColors } = useTheme();
  const handleToggle = makeToggleHandler(onValueChange, disabled);

  return (
    <Host matchContents={{ vertical: true }} style={styles.host}>
      <Toggle
        isOn={value}
        onIsOnChange={handleToggle}
        modifiers={[
          // Brand on-track colour, sourced once via the theming bridge.
          tint(brandAccentColor(brandColors)),
          // SwiftUI greys the control and blocks interaction natively.
          disabledModifier(disabled),
          // No explicit accessibilityLabel: SwiftUI derives the label from BOTH
          // Text children (title + subtitle), so VoiceOver announces the
          // description too — the standard iOS Settings behaviour, and parity with
          // Android (which reads label + description). The switch trait + on/off
          // value are added by the native Toggle.
        ]}
      >
        <Text>{label}</Text>
        {description ? <Text>{description}</Text> : null}
      </Toggle>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
  },
});
