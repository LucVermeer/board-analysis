// Test stub for the platform-split SwitcherForm. Its iOS / Android implementations
// render native @expo/ui trees (a SwiftUI `Form` / Compose `LazyColumn` of cards)
// that can't mount under Vitest's node env, and Vitest doesn't resolve
// `.ios`/`.android` platform extensions, so any suite that transitively renders the
// Channel / Branch switcher screens redirects here via a vite alias (see
// vite.config.ts).
//
// This is a FAITHFUL PASSTHROUGH (not a null stub): it preserves the public API and
// the button accessibility semantics with plain React Native primitives, so screen
// tests' label / role assertions keep passing. Component tests that assert the
// switcher screens' model register their own vi.mock, which takes precedence over
// this alias.

import { Pressable, Text, TextInput, View } from 'react-native';
import type { SwitcherFormProps } from '../src/components/SwitcherForm.types';

export function SwitcherForm({ model }: SwitcherFormProps) {
  return (
    <View>
      {model.sections.map((section) => (
        <View key={section.key}>
          {section.title ? <Text>{section.title}</Text> : null}
          {section.intro ? <Text>{section.intro}</Text> : null}
          {section.rows.map((row) => {
            switch (row.kind) {
              case 'info':
                return (
                  <View key={row.key}>
                    <Text>{row.label}</Text>
                    <Text>{row.value}</Text>
                  </View>
                );
              case 'status':
                return <Text key={row.key}>{row.label}</Text>;
              case 'target':
                return (
                  <Pressable
                    key={row.key}
                    onPress={row.onPress}
                    disabled={!row.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={row.title}
                    accessibilityState={{ selected: row.state === 'active', disabled: !row.onPress }}
                  >
                    <Text>{row.title}</Text>
                    {row.subtitle ? <Text>{row.subtitle}</Text> : null}
                  </Pressable>
                );
              case 'field':
                return (
                  <TextInput
                    key={row.key}
                    aria-label={row.label}
                    placeholder={row.placeholder}
                    value={row.value}
                    editable={row.editable}
                    onChangeText={row.onChangeText}
                    onSubmitEditing={() => row.onSubmit()}
                  />
                );
              case 'action':
                return (
                  <Pressable
                    key={row.key}
                    onPress={row.onPress}
                    disabled={row.disabled}
                    accessibilityRole="button"
                    accessibilityLabel={row.label}
                    accessibilityState={{ disabled: Boolean(row.disabled) }}
                  >
                    <Text>{row.label}</Text>
                  </Pressable>
                );
              default:
                return null;
            }
          })}
          {section.footer ? <Text>{section.footer}</Text> : null}
        </View>
      ))}
    </View>
  );
}
