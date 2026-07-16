// @vitest-environment jsdom
//
// Regression coverage for issue #3604: browser translators (Chrome/Safari
// auto-translate) mutate React-owned DOM text nodes, and when React later
// tries to remove/insert a node that's been reparented, it throws
// `NotFoundError: Failed to execute 'removeChild'/'insertBefore' on 'Node'`.
// The list rows already carried `translate="no"` + a recoverable
// ErrorBoundary (April 2026, PR #1163) — this file covers the header row
// (search pills + angle selector), which didn't have either and could crash
// straight past the local boundary into the root `app/error.tsx` handler.
//
// This file intentionally does NOT mock `../../error-boundary` (unlike
// climbs-list-virtualization.test.tsx) so the real recoverable behavior runs.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import type { Climb, BoardDetails } from '@/app/lib/types';
import ClimbsList from '../climbs-list';

// --- Mocks (mirrors climbs-list-virtualization.test.tsx, minus error-boundary) ---

vi.mock('next/navigation', () => ({
  usePathname: () => '/kilter/original/12x12/default/40/list',
}));

vi.mock('@/app/hooks/use-is-dark-mode', () => ({
  useIsDarkMode: () => false,
}));

vi.mock('@/app/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('../../climb-card/climb-list-item', () => ({
  default: ({ climb }: { climb: Climb }) => (
    <div data-testid="climb-list-item" data-uuid={climb.uuid}>
      {climb.name}
    </div>
  ),
}));

vi.mock('../../climb-card/climb-card', () => ({
  default: ({ climb }: { climb: Climb }) => (
    <div data-testid="climb-card" data-uuid={climb.uuid}>
      {climb.name}
    </div>
  ),
}));

vi.mock('../../climb-card/drawer-climb-header', () => ({
  default: () => <div data-testid="drawer-climb-header" />,
}));

vi.mock('../../climb-actions', () => ({
  ClimbActions: () => <div data-testid="climb-actions" />,
}));

vi.mock('../../climb-actions/playlist-selection-content', () => ({
  default: () => <div data-testid="playlist-selection-content" />,
}));

vi.mock('../board-page-skeleton', () => ({
  ClimbCardSkeleton: () => <div data-testid="climb-card-skeleton" />,
  ClimbListItemSkeleton: () => <div data-testid="climb-list-item-skeleton" />,
}));

vi.mock('@/app/lib/user-preferences-db', () => ({
  getPreference: vi.fn(() => Promise.resolve('list')),
  setPreference: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/app/hooks/use-infinite-scroll', () => ({
  useInfiniteScroll: () => ({ sentinelRef: { current: null } }),
}));

vi.mock('@/app/lib/rendering-metrics', () => ({
  trackRenderError: vi.fn(),
}));

vi.mock('../climb-list-utils', () => ({
  classifyClimbListChange: () => 'replace',
}));

vi.mock('@/app/lib/climb-action-utils', () => ({
  getExcludedClimbActions: () => [],
}));

vi.mock('../selected-climb-store', () => ({
  SelectionStoreContext: React.createContext(null),
  useSelectionStore: () => ({
    getSnapshot: () => null,
    subscribe: () => () => {},
    setUuid: vi.fn(),
  }),
  useIsClimbSelected: () => false,
}));

vi.mock('../climbs-list.module.css', () => ({
  default: { gridItem: 'gridItem', listItem: 'listItem' },
}));

vi.mock('@/app/theme/theme-config', () => ({
  themeTokens: {
    spacing: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 16: 64 },
    colors: { error: '#B8524C', primary: '#8C4A52', success: '#6B9080' },
    neutral: { 200: '#E5E7EB', 400: '#9CA3AF', 500: '#6B7280', 600: '#4B5563' },
    typography: {
      fontSize: { xs: 12, sm: 14, base: 16, xl: 20, '2xl': 24 },
      fontWeight: { normal: 400, semibold: 600, bold: 700 },
    },
    layout: { bottomNavSpacer: 80 },
  },
}));

vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: (opts: {
    count: number;
    estimateSize: () => number;
    getItemKey: (i: number) => string | number;
  }) => {
    const estimatedSize = opts.estimateSize();
    const items = Array.from({ length: opts.count }, (_, i) => ({
      index: i,
      key: opts.getItemKey ? opts.getItemKey(i) : `item-${i}`,
      start: i * estimatedSize,
      size: estimatedSize,
      end: (i + 1) * estimatedSize,
      lane: 0,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => opts.count * estimatedSize,
      measureElement: vi.fn(),
      scrollToIndex: vi.fn(),
      scrollOffset: 0,
      range: opts.count > 0 ? { startIndex: 0, endIndex: opts.count - 1 } : null,
    };
  },
}));

// --- Helpers ---

function makeClimb(index: number): Climb {
  return {
    uuid: `climb-${index}`,
    name: `Test Boulder ${index}`,
    setter_username: 'setter',
    description: '',
    frames: `p${index}r14`,
    angle: 40,
    ascensionist_count: 5,
    difficulty: 'V4',
    quality_average: '3.0',
    stars: 0,
    difficulty_error: '0.5',
    benchmark_difficulty: null,
  };
}

function makeBoardDetails(): BoardDetails {
  return {
    board_name: 'kilter',
    layout_id: 1,
    size_id: 1,
    set_ids: [1],
    images_to_holds: {},
    holdsData: [],
    edge_left: 0,
    edge_right: 100,
    edge_bottom: 0,
    edge_top: 100,
    boardHeight: 100,
    boardWidth: 100,
  } as BoardDetails;
}

const threeClimbs = Array.from({ length: 3 }, (_, i) => makeClimb(i));

describe('ClimbsList translator-DOM resilience (#3604)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('marks the whole list surface translate="no" so browser translators skip it', () => {
    const { container } = render(
      <ClimbsList
        boardDetails={makeBoardDetails()}
        climbs={threeClimbs}
        isFetching={false}
        hasMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    // The outermost rendered element is the wrapper Box — SelectionStoreContext.Provider
    // is a transparent React context provider with no DOM node of its own.
    expect(container.firstElementChild?.getAttribute('translate')).toBe('no');
  });

  it('recovers a header crash (removeChild NotFoundError) without unmounting the climb rows below', async () => {
    // A persistent flag (not a "throw once" counter) — React 19 retries a
    // render-phase throw once, synchronously, before handing off to the
    // nearest error boundary. A component that throws only on its first
    // invocation gets silently rescued by that internal retry and never
    // reaches componentDidCatch at all, which would defeat this test. Real
    // translator-DOM errors happen in the commit phase (an actual DOM
    // removeChild call failing), which isn't eligible for that render-phase
    // retry — so this mirrors error-boundary.test.tsx's proven pattern to
    // reliably exercise the boundary's own rAF-driven recovery instead.
    let shouldThrow = true;
    function FlakyHeader() {
      if (shouldThrow) {
        // Same error shape browser-translator DOM mutation produces (see
        // isTranslatorDomError in app/error.tsx).
        throw new Error(
          "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
        );
      }
      return <div data-testid="flaky-header">header ok</div>;
    }

    render(
      <ClimbsList
        boardDetails={makeBoardDetails()}
        climbs={threeClimbs}
        isFetching={false}
        hasMore={false}
        onLoadMore={vi.fn()}
        headerInline={<FlakyHeader />}
      />,
    );

    // The header threw and its ErrorBoundary caught it — but the climb rows
    // are in a separate ErrorBoundary and were never touched.
    expect(screen.getAllByTestId('climb-list-item')).toHaveLength(3);
    expect(screen.queryByTestId('flaky-header')).toBeNull();

    // Fix the underlying condition, then flush the requestAnimationFrame the
    // recoverable boundary scheduled from componentDidCatch.
    shouldThrow = false;
    await act(async () => {
      vi.advanceTimersByTime(16);
    });

    // Header remounted and rendered successfully; climb rows are unaffected.
    expect(screen.getByTestId('flaky-header')).toBeTruthy();
    expect(screen.getAllByTestId('climb-list-item')).toHaveLength(3);
  });

  it('contains a persistently-crashing header to its own boundary — climb rows keep rendering', async () => {
    // Arrow-function const (not a `function` declaration) — matches the
    // working pattern in error-boundary.test.tsx. A `function` declaration
    // that only throws infers a `void` return type here, which TS rejects
    // as a JSX element type; the arrow form infers `never`, which is fine.
    const AlwaysThrow = () => {
      throw new Error(
        "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
      );
    };

    render(
      <ClimbsList
        boardDetails={makeBoardDetails()}
        climbs={threeClimbs}
        isFetching={false}
        hasMore={false}
        onLoadMore={vi.fn()}
        headerInline={<AlwaysThrow />}
      />,
    );

    // Exhaust the header boundary's retry budget (3 attempts).
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
    }

    // The header gave up and shows nothing (no fallback prop passed), but
    // the climb list below is completely unaffected — no white screen.
    expect(screen.getAllByTestId('climb-list-item')).toHaveLength(3);
  });
});
