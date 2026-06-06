// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { ClimbQueueItem } from '@boardsesh/queue';

// Hoisted, per-test-configurable view of the global state the bar reads.
const cfg = vi.hoisted(() => ({
  onClimbsTab: true,
  currentClimbQueueItem: { climb: { uuid: 'c1', angle: 40 } } as unknown as ClimbQueueItem | null,
}));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

vi.mock('react-native-reanimated', () => ({
  default: { View: ({ children }: { children?: ReactNode }) => createElement('div', null, children) },
  FadeIn: { duration: () => ({}) },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => ({ value }),
  withTiming: (value: number) => value,
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => ({ useSegments: () => [] }));
vi.mock('../../../lib/route-segments', () => ({
  isClimbsTabRoute: () => cfg.onClimbsTab,
  isTabsRoute: () => false,
}));
vi.mock('../../../providers/queue-provider', () => ({
  useQueue: () => ({ state: { currentClimbQueueItem: cfg.currentClimbQueueItem } }),
}));
vi.mock('../../../hooks/use-reduce-motion', () => ({ useReduceMotion: () => true }));
vi.mock('../../../theme/animations', () => ({ timing: { fast: 150, normal: 250 } }));
vi.mock('../../../theme/layout', () => ({
  TAB_BAR_HEIGHT: 49,
  TOOLBAR_RESERVE: 74,
  TOOLBAR_SIDE_MARGIN: 16,
  TOOLBAR_GAP: 8,
  TOOLBAR_FAB_SIZE: 56,
  TOOLBAR_GAP_ABOVE_TABBAR: 10,
  glassSize: { hero: 64 },
}));
// Legacy bar renders only where the native bottom accessory doesn't (Android /
// iOS < 26) — force that path so the capsule/tick assertions hold.
vi.mock('../../../hooks/use-bottom-accessory', () => ({ isBottomAccessoryAvailable: () => false }));
vi.mock('../ClimbCapsule', () => ({ ClimbCapsule: () => createElement('div', { 'data-capsule': 'true' }) }));
vi.mock('../LogAscentFab', () => ({ LogAscentFab: () => createElement('div', { 'data-tick': 'true' }) }));

import { PersistentQueueBar } from '../persistent-queue-bar';

describe('PersistentQueueBar', () => {
  beforeEach(() => {
    cfg.onClimbsTab = true;
    cfg.currentClimbQueueItem = { climb: { uuid: 'c1', angle: 40 } } as unknown as ClimbQueueItem;
  });

  it('renders nothing when no climb is current', () => {
    cfg.currentClimbQueueItem = null;
    const { container } = render(<PersistentQueueBar />);
    expect(container.querySelector('[data-capsule]')).toBeNull();
  });

  it('on the Climbs tab: shows the capsule and standalone tick fallback', () => {
    const { container } = render(<PersistentQueueBar />);
    expect(container.querySelector('[data-capsule]')).not.toBeNull();
    expect(container.querySelector('[data-tick]')).not.toBeNull();
  });

  it('off the Climbs tab: capsule only, no tick (regardless of layout)', () => {
    cfg.onClimbsTab = false;
    const { container } = render(<PersistentQueueBar />);
    expect(container.querySelector('[data-capsule]')).not.toBeNull();
    expect(container.querySelector('[data-tick]')).toBeNull();
  });
});
