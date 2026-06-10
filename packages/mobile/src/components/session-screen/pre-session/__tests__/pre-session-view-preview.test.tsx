// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClimbQueueItem } from '@boardsesh/queue';

// The preview hook is mocked; the test mutates `preview.result.items` /
// `refreshingUuids` and rerenders to drive the view's row props.
const preview = vi.hoisted(() => ({
  result: {
    items: [] as unknown[],
    status: 'ready' as 'idle' | 'loading' | 'ready' | 'error',
    refreshingUuids: new Set<string>(),
    plannedCount: 0,
    regenerate: vi.fn(),
    refreshSlot: vi.fn(),
    toQueueItems: () => [] as ClimbQueueItem[],
  },
}));

// Captures every WorkoutPreviewRow render so the test can read isActive /
// refreshDisabled per row, plus the latest onPress to simulate a tap.
const rows = vi.hoisted(() => ({
  rendered: [] as Array<{ uuid: string; isActive: boolean; isRefreshing: boolean; refreshDisabled: boolean }>,
  onPress: null as ((item: ClimbQueueItem) => void) | null,
}));

const footer = vi.hoisted(() => ({
  styles: [] as unknown[],
}));

const list = vi.hoisted(() => ({
  props: [] as Array<{
    nestedScrollEnabled?: boolean;
    keyboardShouldPersistTaps?: unknown;
    dataLength: number;
    hasGestureScrollComponent: boolean;
    hasHeaderComponent: boolean;
  }>,
}));

const bottomChrome = vi.hoisted(() => ({
  metrics: {
    insideTabs: true,
    scrollBottomPadding: 200,
    tabBarBottom: 120,
    tabBarHeight: 49,
    fixedFooterBottom: 120,
  },
}));

vi.mock('react-native', () => ({
  View: ({ children, testID, style }: { children?: ReactNode; testID?: string; style?: unknown }) => {
    if (testID === 'pre-session-footer') {
      footer.styles = Array.isArray(style) ? style : [style];
    }
    return createElement('div', testID ? { 'data-testid': testID } : null, children);
  },
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));

vi.mock('react-native-gesture-handler', () => ({
  ScrollView: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('react-native-reanimated', () => ({
  useSharedValue: (value: number) => ({ value }),
}));

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
    renderScrollComponent,
    ListHeaderComponent,
    nestedScrollEnabled,
    keyboardShouldPersistTaps,
  }: {
    data?: unknown[];
    renderItem?: (info: { item: unknown; index: number }) => ReactNode;
    renderScrollComponent?: unknown;
    ListHeaderComponent?: ReactNode;
    nestedScrollEnabled?: boolean;
    keyboardShouldPersistTaps?: unknown;
  }) => {
    list.props.push({
      nestedScrollEnabled,
      keyboardShouldPersistTaps,
      dataLength: data?.length ?? 0,
      hasGestureScrollComponent: renderScrollComponent != null,
      hasHeaderComponent: ListHeaderComponent != null,
    });
    return createElement(
      'div',
      null,
      ListHeaderComponent,
      ...(data ?? []).map((rowItem, index) =>
        createElement('div', { key: index }, renderItem?.({ item: rowItem, index })),
      ),
    );
  },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@boardsesh/board-config', () => ({ toBoardName: (boardType: string) => boardType }));
vi.mock('../../../../lib/analytics', () => ({ track: vi.fn() }));
vi.mock('../../../Button', () => ({ Button: () => createElement('button') }));
vi.mock('../../../Card', () => ({
  Card: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../../../GlassSurface', () => ({ GlassSurface: () => null }));
vi.mock('../../../SectionHeader', () => ({ SectionHeader: () => null }));
vi.mock('../../RecordTopChrome', () => ({ RecordTopChrome: () => null }));
vi.mock('../../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../../../../providers/theme-provider', () => ({ useTheme: () => ({ systemColors: {} }) }));
vi.mock('../../../../lib/graphql/use-active-board', () => ({
  useActiveBoard: () => ({ data: { boardType: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2', angle: 40 } }),
}));
vi.mock('../../../../providers/auth-provider', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock('../../../../providers/queue-provider', () => ({
  useQueueActions: () => ({ startSession: vi.fn(), setQueue: vi.fn() }),
}));
vi.mock('../../../../providers/drawer-host-provider', () => ({ useDrawerHost: () => ({ openPlayDrawer: vi.fn() }) }));
vi.mock('../../../../providers/toast-provider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../../hooks/use-native-glass', () => ({ useNativeGlass: () => false }));
vi.mock('../../../../hooks/use-bottom-chrome-metrics', () => ({
  useBottomChromeMetrics: () => bottomChrome.metrics,
}));
vi.mock('../../../../theme/tokens', () => ({ spacing: { 2: 8, 3: 12, 4: 16 }, borderRadius: { lg: 16 } }));
vi.mock('../BoardSummaryCard', () => ({ BoardSummaryCard: () => null }));
vi.mock('../GeneratorPickerCard', () => ({ GeneratorPickerCard: () => null }));
vi.mock('../use-workout-preview', () => ({ useWorkoutPreview: () => preview.result }));
vi.mock('../WorkoutPreviewRow', () => ({
  WorkoutPreviewRow: ({
    item,
    isActive,
    isRefreshing,
    refreshDisabled,
    onPress,
  }: {
    item: ClimbQueueItem;
    isActive: boolean;
    isRefreshing: boolean;
    refreshDisabled: boolean;
    onPress: (item: ClimbQueueItem) => void;
  }) => {
    rows.rendered.push({ uuid: item.uuid, isActive, isRefreshing, refreshDisabled });
    rows.onPress = onPress;
    return null;
  },
}));

import { PreSessionView } from '../PreSessionView';

function makeRow(uuid: string) {
  return {
    item: { uuid, climb: { uuid: `${uuid}-climb`, name: uuid } },
    slot: { grade: 10, section: 'main', index: 0 },
  };
}

function getStyleNumber(styles: unknown[], key: string): number | null {
  for (const style of styles) {
    if (style == null || typeof style !== 'object' || Array.isArray(style)) continue;
    const value = (style as Record<string, unknown>)[key];
    if (typeof value === 'number') return value;
  }
  return null;
}

beforeEach(() => {
  rows.rendered = [];
  rows.onPress = null;
  footer.styles = [];
  list.props = [];
  bottomChrome.metrics = {
    insideTabs: true,
    scrollBottomPadding: 200,
    tabBarBottom: 120,
    tabBarHeight: 49,
    fixedFooterBottom: 120,
  };
  preview.result.items = [makeRow('a'), makeRow('b')] as unknown[];
  preview.result.refreshingUuids = new Set<string>();
});

describe('PreSessionView preview rows', () => {
  it('clears the active highlight once a regeneration replaces the rows', () => {
    const view = render(createElement(PreSessionView));

    // Tap row "a" → it becomes the highlighted preview row.
    act(() => {
      rows.onPress?.({ uuid: 'a' } as ClimbQueueItem);
    });
    expect(rows.rendered.some((row) => row.uuid === 'a' && row.isActive)).toBe(true);

    // Regenerate: fresh uuids replace the old rows, so "a" no longer exists.
    rows.rendered = [];
    preview.result.items = [makeRow('c'), makeRow('d')] as unknown[];
    act(() => {
      view.rerender(createElement(PreSessionView));
    });

    // The effect dropped the stale uuid, so nothing is highlighted.
    expect(rows.rendered.length).toBeGreaterThan(0);
    expect(rows.rendered.every((row) => !row.isActive)).toBe(true);
  });

  it('blocks the other rows refresh button while one row regenerates', () => {
    preview.result.refreshingUuids = new Set<string>(['a']);
    render(createElement(PreSessionView));

    const rowA = rows.rendered.find((row) => row.uuid === 'a');
    const rowB = rows.rendered.find((row) => row.uuid === 'b');
    // The regenerating row spins (isRefreshing) rather than going to the dimmed
    // disabled state, so refreshDisabled stays false for it.
    expect(rowA).toMatchObject({ isRefreshing: true, refreshDisabled: false });
    // Every other row's refresh is disabled so the dropped tap is visible.
    expect(rowB).toMatchObject({ isRefreshing: false, refreshDisabled: true });
  });

  it('keeps the preview rows virtualized in a nested FlashList', () => {
    render(createElement(PreSessionView));

    expect(list.props.at(-1)).toMatchObject({
      nestedScrollEnabled: true,
      keyboardShouldPersistTaps: 'handled',
      dataLength: 2,
      hasGestureScrollComponent: true,
      hasHeaderComponent: true,
    });
    expect(rows.rendered.map((row) => row.uuid)).toEqual(['a', 'b']);
  });

  it('keeps the generator controls in the list header when the preview is empty', () => {
    preview.result.items = [];

    render(createElement(PreSessionView));

    expect(list.props.at(-1)).toMatchObject({ dataLength: 0, hasHeaderComponent: true });
    expect(rows.rendered).toEqual([]);
  });

  it('pins the Start bar above the bottom chrome via the fixed-footer metric', () => {
    render(createElement(PreSessionView));

    // fixedFooterBottom is the tab-bar clearance when no queue accessory is
    // present, so the bar sits flush rather than stranded mid-screen.
    expect(getStyleNumber(footer.styles, 'bottom')).toBe(120);
  });

  it('lifts to clear the queue accessory when it reserves space', () => {
    bottomChrome.metrics = { ...bottomChrome.metrics, fixedFooterBottom: 178 };

    render(createElement(PreSessionView));

    expect(getStyleNumber(footer.styles, 'bottom')).toBe(178);
  });
});
