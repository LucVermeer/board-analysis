// Test stub for the platform-split SwitchRow. Its iOS / Android implementations
// render native @expo/ui trees (SwiftUI Toggle / Compose Switch) that can't mount
// under Vitest's node env, and Vitest doesn't resolve `.ios`/`.android` platform
// extensions, so any suite that transitively renders SwitchRow redirects here via
// a vite alias (see vite.config.ts).
//
// This is a FAITHFUL PASSTHROUGH (not a null stub): it preserves the public API
// and the `switch` accessibility semantics with plain React Native primitives, so
// the ~10 indirect screen tests that render a SwitchRow keep their label / role
// assertions passing unchanged. Component tests that assert SwitchRow internals
// register their own vi.mock, which takes precedence over this alias.

import { Pressable, Switch, Text, View } from 'react-native';
// The shared props type has no native imports, so it's safe to pull into the
// node-env stub — keeps the stub's contract from drifting from the real component.
import type { SwitchRowProps } from '../src/components/SwitchRow.types';

export function SwitchRow({ label, description, value, onValueChange, disabled = false }: SwitchRowProps) {
  const handleToggle = (next: boolean) => {
    if (disabled) return;
    onValueChange(next);
  };

  return (
    <Pressable
      onPress={() => handleToggle(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
    >
      <View>
        <Text>{label}</Text>
        {description ? <Text>{description}</Text> : null}
      </View>
      <Switch value={value} onValueChange={handleToggle} disabled={disabled} />
    </Pressable>
  );
}
