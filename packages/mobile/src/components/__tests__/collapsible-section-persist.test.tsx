// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

// AsyncStorage holds the persisted expand map. Seed it before rendering to drive
// the cold-load path (store unloaded at first mount, value arrives async).
vi.mock('@react-native-async-storage/async-storage', () => {
  const storage: Record<string, string> = {};
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage[key] ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: vi.fn(async (key: string) => {
        delete storage[key];
      }),
      __setRaw: (key: string, value: string) => {
        storage[key] = value;
      },
    },
  };
});

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
    createElement('button', { onClick: () => onPress?.() }, children),
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: 'ios' },
  PlatformColor: (name: string) => name,
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: ({ children }: { children?: ReactNode }) => createElement('div', null, children) },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
  withTiming: (value: number) => value,
}));
vi.mock('../Text', () => ({ Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children) }));
vi.mock('../Icon', () => ({ Icon: () => createElement('i', null) }));
vi.mock('../../lib/haptics', () => ({ hapticSelection: vi.fn() }));

const BODY = 'SECTION_BODY';

async function seedStorage(key: string, value: boolean) {
  const asyncStorage = (await import('@react-native-async-storage/async-storage')).default as unknown as {
    __setRaw: (key: string, value: string) => void;
  };
  asyncStorage.__setRaw('climbCardSectionExpanded', JSON.stringify({ [key]: value }));
}

import { CollapsibleSection } from '../CollapsibleSection';

describe('CollapsibleSection persistence', () => {
  it('reconciles to the persisted expanded state once the cold store loads', async () => {
    // Store starts unloaded (first test in the file): seed AsyncStorage, then
    // render collapsed. The async load should flip the section open via the
    // persisted-sync effect.
    await seedStorage('logbook', true);
    const { queryByText, getByText } = render(
      createElement(CollapsibleSection, {
        title: 'Logbook',
        persistKey: 'logbook',
        defaultExpanded: false,
        children: createElement('span', null, BODY),
      }),
    );

    // Cold store → seeded from default (collapsed) → body not rendered yet.
    expect(queryByText(BODY)).toBeNull();
    // After the async load resolves, the effect expands the section.
    await waitFor(() => expect(getByText(BODY)).toBeTruthy());
  });

  it('seeds the initial state synchronously when the store is already warm', () => {
    // The previous test loaded the store (hasLoaded=true, logbook=true), so a
    // fresh mount reads the value synchronously and opens with no async wait.
    const { getByText } = render(
      createElement(CollapsibleSection, {
        title: 'Logbook',
        persistKey: 'logbook',
        defaultExpanded: false,
        children: createElement('span', null, BODY),
      }),
    );
    expect(getByText(BODY)).toBeTruthy();
  });
});
