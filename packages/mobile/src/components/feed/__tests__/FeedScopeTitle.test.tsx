// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { ContextMenuAction } from 'react-native-context-menu-view';
import type { AppMenuAction } from '../../AppMenu';

// Capture the props FeedScopeTitle hands to AppMenu — the per-variant menu and the
// selected-row marker are AppMenu's job (covered by app-menu.test.tsx); here we
// only verify FeedScopeTitle maps its ContextMenu-shaped actions onto AppMenu's.
const capture = vi.hoisted(() => ({
  actions: undefined as AppMenuAction[] | undefined,
  onSelectIndex: undefined as ((index: number) => void) | undefined,
  accessibilityLabel: undefined as string | undefined,
}));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-view': 'true' }, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {}, hairlineWidth: 1 },
}));

vi.mock('../../AppMenu', () => ({
  AppMenu: ({
    actions,
    onSelectIndex,
    accessibilityLabel,
    children,
  }: {
    actions: AppMenuAction[];
    onSelectIndex: (index: number) => void;
    accessibilityLabel?: string;
    children?: ReactNode;
  }) => {
    capture.actions = actions;
    capture.onSelectIndex = onSelectIndex;
    capture.accessibilityLabel = accessibilityLabel;
    return createElement('div', { 'data-app-menu': 'true' }, children);
  },
}));

vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../Icon', () => ({ Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }) }));
vi.mock('../../GlassSurface', () => ({ GlassSurface: () => createElement('div', { 'data-glass': 'true' }) }));
vi.mock('../../../hooks/use-native-glass', () => ({ useNativeGlass: () => false }));
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: { label: '#000', secondaryLabel: '#999', separator: '#ccc', elevatedSurface: '#fff' },
  }),
}));
vi.mock('../../../theme/tokens', () => ({ spacing: { 1: 4, 2: 8, 4: 16 }, shadows: { sm: {} } }));
vi.mock('../../../theme/layout', () => ({ glassSize: { capsule: 44 } }));

import { FeedScopeTitle } from '../FeedScopeTitle';

const ACTIONS: ContextMenuAction[] = [
  { title: 'My crew', selected: true },
  { title: 'Everyone', selected: false },
];

beforeEach(() => {
  capture.actions = undefined;
  capture.onSelectIndex = undefined;
  capture.accessibilityLabel = undefined;
});

describe('FeedScopeTitle', () => {
  it('maps its ContextMenu-shaped actions onto AppMenu actions (title → label, selected kept)', () => {
    render(createElement(FeedScopeTitle, { title: 'My crew', actions: ACTIONS, onSelectIndex: () => {} }));
    expect(capture.actions).toEqual([
      { label: 'My crew', selected: true, destructive: undefined },
      { label: 'Everyone', selected: false, destructive: undefined },
    ]);
  });

  it('labels the menu with the active scope and forwards onSelectIndex', () => {
    const onSelectIndex = vi.fn();
    render(createElement(FeedScopeTitle, { title: 'My crew', actions: ACTIONS, onSelectIndex }));
    expect(capture.accessibilityLabel).toBe('My crew');
    capture.onSelectIndex?.(1);
    expect(onSelectIndex).toHaveBeenCalledWith(1);
  });
});
