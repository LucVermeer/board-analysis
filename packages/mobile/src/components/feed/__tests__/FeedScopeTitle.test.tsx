// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { ContextMenuAction, ContextMenuOnPressNativeEvent } from 'react-native-context-menu-view';

// Drives Platform.OS so each test can render the iOS vs Android branch.
const cfg = vi.hoisted(() => ({ os: 'ios' as 'ios' | 'android' }));

// Captures the props the component hands to ContextMenu so tests can inspect the
// derived actions array, plus an `onPress` the tests can fire with a native event.
const capture = vi.hoisted(() => ({
  actions: undefined as ContextMenuAction[] | undefined,
  onPress: undefined as ((event: { nativeEvent: ContextMenuOnPressNativeEvent }) => void) | undefined,
}));

// Minimal RN surface: View → div, StyleSheet.create passthrough, controllable Platform.
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-view': 'true' }, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Platform: {
    get OS() {
      return cfg.os;
    },
    select: (spec: Record<string, unknown>) => spec[cfg.os],
  },
}));

// Stub that records the `actions` prop and surfaces `onPress` for tests to fire.
vi.mock('react-native-context-menu-view', () => ({
  default: ({
    actions,
    onPress,
    children,
  }: {
    actions?: ContextMenuAction[];
    onPress?: (event: { nativeEvent: ContextMenuOnPressNativeEvent }) => void;
    children?: ReactNode;
  }) => {
    capture.actions = actions;
    capture.onPress = onPress;
    return createElement('div', { 'data-context-menu': 'true' }, children);
  },
}));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

vi.mock('../../Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('../../GlassSurface', () => ({ GlassSurface: () => createElement('div', { 'data-glass': 'true' }) }));
vi.mock('../../../hooks/use-native-glass', () => ({ useNativeGlass: () => false }));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: { label: '#000', secondaryLabel: '#999', separator: '#ccc', elevatedSurface: '#fff' },
  }),
}));

vi.mock('../../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 4: 16 },
  shadows: { sm: {} },
}));

vi.mock('../../../theme/layout', () => ({ glassSize: { capsule: 44 } }));

import { FeedScopeTitle } from '../FeedScopeTitle';

const CHECKMARK = '✓';

describe('FeedScopeTitle', () => {
  beforeEach(() => {
    cfg.os = 'ios';
    capture.actions = undefined;
    capture.onPress = undefined;
  });

  it('marks the selected action with a checkmark prefix on Android', () => {
    cfg.os = 'android';
    const actions: ContextMenuAction[] = [
      { title: 'My crew', selected: true },
      { title: 'Everyone', selected: false },
    ];
    render(<FeedScopeTitle title="My crew" actions={actions} onSelectIndex={() => {}} />);

    const handed = capture.actions;
    expect(handed).toBeDefined();
    expect(handed?.[0].title.startsWith(CHECKMARK)).toBe(true);
    expect(handed?.[0].title.endsWith('My crew')).toBe(true);
    // Non-selected rows are untouched.
    expect(handed?.[1].title).toBe('Everyone');
  });

  it('passes actions through unchanged on iOS (native checkmark renders the marker)', () => {
    cfg.os = 'ios';
    const actions: ContextMenuAction[] = [
      { title: 'My crew', selected: true },
      { title: 'Everyone', selected: false },
    ];
    render(<FeedScopeTitle title="My crew" actions={actions} onSelectIndex={() => {}} />);

    // Same reference, no prefix injected.
    expect(capture.actions).toBe(actions);
    expect(capture.actions?.[0].title).toBe('My crew');
    expect(capture.actions?.[1].title).toBe('Everyone');
  });

  it('forwards the pressed native index to onSelectIndex', () => {
    const onSelectIndex = vi.fn();
    const actions: ContextMenuAction[] = [
      { title: 'My crew', selected: true },
      { title: 'Everyone', selected: false },
    ];
    render(<FeedScopeTitle title="My crew" actions={actions} onSelectIndex={onSelectIndex} />);

    capture.onPress?.({ nativeEvent: { index: 1, indexPath: [1], name: 'Everyone' } });
    expect(onSelectIndex).toHaveBeenCalledWith(1);
  });
});
