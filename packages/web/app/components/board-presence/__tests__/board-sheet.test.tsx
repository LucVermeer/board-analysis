import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, fireEvent, waitFor } from '@testing-library/react';
import React, { createElement } from 'react';
import type { BoardPresenceClimb, BoardPresenceStats } from '@boardsesh/shared-schema';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';

const presence = vi.hoisted(() => ({
  currentClimb: null as BoardPresenceClimb | null,
  history: [] as BoardPresenceClimb[],
  stats: null as BoardPresenceStats | null,
}));

const historyPagination = vi.hoisted(() => ({
  olderHistory: [] as BoardPresenceClimb[],
  isLoadingOlder: false,
  hasMore: true,
  loadOlder: vi.fn(),
}));

const presenceControls = vi.hoisted(() => ({
  boardId: 123 as number | null,
}));

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('@boardsesh/board-presence-react', () => ({
  useBoardPresenceCurrent: () => ({
    currentClimb: presence.currentClimb,
    previousClimb: null,
    undoTarget: null,
    isLive: true,
  }),
  useBoardPresenceFeed: () => ({ history: presence.history, stats: presence.stats }),
  useBoardHistoryPagination: () => historyPagination,
}));

vi.mock('@/app/hooks/use-grade-format', () => ({
  useGradeFormat: () => ({
    formatGrade: (grade: string | null | undefined) => grade ?? null,
    getGradeColor: () => '#abcdef',
  }),
}));

vi.mock('@/app/lib/analytics', () => ({ track: analytics.track }));

vi.mock('../board-presence-context', () => ({
  useBoardPresenceControls: () => ({ boardId: presenceControls.boardId }),
}));

import { BoardSheet } from '../board-sheet';

function makeClimb(climbUuid: string, seq: number, overrides: Partial<BoardPresenceClimb> = {}): BoardPresenceClimb {
  return {
    climbUuid,
    seq,
    sentAt: '2026-06-09T00:00:00.000Z',
    name: `Climb ${climbUuid}`,
    grade: 'V5',
    angle: 40,
    setter: 'Some Setter',
    sentByDisplayName: 'Marco',
    ...overrides,
  };
}

const noop = () => {};
const SWITCH_BOARD_ARIA = tFromCatalog('session', 'boardPresence.switchBoardAria');
const CLOSE_ARIA = tFromCatalog('session', 'boardPresence.close');
const EMPTY_TITLE = tFromCatalog('session', 'boardPresence.emptyTitle');
const HISTORY_HEADER = tFromCatalog('session', 'boardPresence.historyHeader');
const LOAD_MORE = tFromCatalog('session', 'boardPresence.loadMore');
const LOADING_MORE = tFromCatalog('session', 'boardPresence.loadingMore');

describe('BoardSheet', () => {
  beforeEach(() => {
    presence.currentClimb = null;
    presence.history = [];
    presence.stats = null;
    presenceControls.boardId = 123;
    historyPagination.olderHistory = [];
    historyPagination.isLoadingOlder = false;
    historyPagination.hasMore = true;
    historyPagination.loadOlder.mockClear();
    analytics.track.mockClear();
  });

  it('renders nothing visible when closed', () => {
    const { queryByText } = render(
      createElement(BoardSheet, {
        open: false,
        boardLabel: 'Garage Wall',
        onClose: noop,
        onSwitchBoard: noop,
      }),
    );
    // MUI Drawer keeps content unmounted/hidden when closed.
    expect(queryByText(EMPTY_TITLE)).toBeNull();
  });

  it('renders the empty state when no climb is on the wall', () => {
    const { getByText } = render(
      createElement(BoardSheet, {
        open: true,
        boardLabel: 'Garage Wall',
        onClose: noop,
        onSwitchBoard: noop,
      }),
    );
    expect(getByText(EMPTY_TITLE)).not.toBeNull();
  });

  it('renders the hero, stats and history when there is wall activity', () => {
    presence.currentClimb = makeClimb('c1', 3);
    presence.history = [makeClimb('c1', 3), makeClimb('c0', 2, { name: 'Older Climb' })];
    presence.stats = {
      climbsSentCount: 14,
      distinctClimbersCount: 5,
      hardestGrade: 'V9',
      topGrade: 'V5',
      lastSentAt: null,
    };

    const { getByText, getAllByText, queryByText } = render(
      createElement(BoardSheet, {
        open: true,
        boardLabel: 'Garage Wall',
        onClose: noop,
        onSwitchBoard: noop,
      }),
    );

    // Hero climb name + history item name both render.
    expect(getAllByText('Climb c1').length).toBeGreaterThan(0);
    expect(getByText('Older Climb')).not.toBeNull();
    // Stats tile value.
    expect(getByText('14')).not.toBeNull();
    expect(getByText(HISTORY_HEADER)).not.toBeNull();
    // No empty state when there is a current climb.
    expect(queryByText(EMPTY_TITLE)).toBeNull();
  });

  it('fires onSwitchBoard from the separated footer control', () => {
    const onSwitchBoard = vi.fn();
    const { getByLabelText } = render(
      createElement(BoardSheet, {
        open: true,
        boardLabel: 'Garage Wall',
        onClose: noop,
        onSwitchBoard,
      }),
    );
    fireEvent.click(getByLabelText(SWITCH_BOARD_ARIA));
    expect(onSwitchBoard).toHaveBeenCalledTimes(1);
  });

  it('fires onClose from the header close button', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      createElement(BoardSheet, {
        open: true,
        boardLabel: 'Garage Wall',
        onClose,
        onSwitchBoard: noop,
      }),
    );
    fireEvent.click(getByLabelText(CLOSE_ARIA));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires BoardHistoryViewed once on open, with the item count and boardId', () => {
    presence.history = [makeClimb('c1', 3), makeClimb('c0', 2)];

    const { rerender } = render(
      createElement(BoardSheet, {
        open: false,
        boardLabel: 'Garage Wall',
        onClose: noop,
        onSwitchBoard: noop,
      }),
    );
    expect(analytics.track).not.toHaveBeenCalledWith(SHARED_EVENTS.BoardHistoryViewed, expect.anything());

    rerender(
      createElement(BoardSheet, {
        open: true,
        boardLabel: 'Garage Wall',
        onClose: noop,
        onSwitchBoard: noop,
      }),
    );

    expect(analytics.track).toHaveBeenCalledWith(SHARED_EVENTS.BoardHistoryViewed, {
      boardId: 123,
      itemCount: 2,
    });
    expect(analytics.track).toHaveBeenCalledTimes(1);
  });

  it('does not fire BoardHistoryViewed on open when there is no history', () => {
    presence.history = [];

    render(
      createElement(BoardSheet, {
        open: true,
        boardLabel: 'Garage Wall',
        onClose: noop,
        onSwitchBoard: noop,
      }),
    );

    expect(analytics.track).not.toHaveBeenCalledWith(SHARED_EVENTS.BoardHistoryViewed, expect.anything());
  });

  it('re-arms BoardHistoryViewed after a close/re-open cycle (body unmounts with the Drawer)', async () => {
    presence.history = [makeClimb('c1', 3)];

    const { rerender, queryByText } = render(
      createElement(BoardSheet, {
        open: true,
        boardLabel: 'Garage Wall',
        onClose: noop,
        onSwitchBoard: noop,
      }),
    );
    expect(analytics.track).toHaveBeenCalledTimes(1);

    rerender(
      createElement(BoardSheet, {
        open: false,
        boardLabel: 'Garage Wall',
        onClose: noop,
        onSwitchBoard: noop,
      }),
    );
    // The MUI temporary Drawer (no keepMounted) unmounts the body once the
    // close transition finishes — that unmount is what resets the
    // once-per-open ref, so wait for it before reopening.
    await waitFor(() => expect(queryByText(HISTORY_HEADER)).toBeNull());

    rerender(
      createElement(BoardSheet, {
        open: true,
        boardLabel: 'Garage Wall',
        onClose: noop,
        onSwitchBoard: noop,
      }),
    );

    expect(analytics.track).toHaveBeenCalledTimes(2);
  });

  describe('load older history', () => {
    it('renders a Load more button and calls loadOlder on click', () => {
      presence.history = [makeClimb('c1', 3)];

      const { getByText } = render(
        createElement(BoardSheet, {
          open: true,
          boardLabel: 'Garage Wall',
          onClose: noop,
          onSwitchBoard: noop,
        }),
      );

      const button = getByText(LOAD_MORE);
      fireEvent.click(button);
      expect(historyPagination.loadOlder).toHaveBeenCalledTimes(1);
    });

    it('does not render the Load more button when there is no history yet', () => {
      presence.history = [];

      const { queryByText } = render(
        createElement(BoardSheet, {
          open: true,
          boardLabel: 'Garage Wall',
          onClose: noop,
          onSwitchBoard: noop,
        }),
      );

      expect(queryByText(LOAD_MORE)).toBeNull();
    });

    it('hides the Load more button once hasMore is false (a short page ended pagination)', () => {
      presence.history = [makeClimb('c1', 3)];
      historyPagination.hasMore = false;

      const { queryByText } = render(
        createElement(BoardSheet, {
          open: true,
          boardLabel: 'Garage Wall',
          onClose: noop,
          onSwitchBoard: noop,
        }),
      );

      expect(queryByText(LOAD_MORE)).toBeNull();
    });

    it('renders loaded older rows appended after the live history', () => {
      presence.history = [makeClimb('c2', 4)];
      historyPagination.olderHistory = [makeClimb('c1', 3), makeClimb('c0', 2, { name: 'Oldest Climb' })];

      const { getByText } = render(
        createElement(BoardSheet, {
          open: true,
          boardLabel: 'Garage Wall',
          onClose: noop,
          onSwitchBoard: noop,
        }),
      );

      expect(getByText('Climb c2')).not.toBeNull();
      expect(getByText('Climb c1')).not.toBeNull();
      expect(getByText('Oldest Climb')).not.toBeNull();
    });

    it('renders an overlapping older row only once — the live window wins (backfill overlap)', () => {
      // The live window gained c1/3 AFTER the page containing it resolved
      // (backfill / foreground catch-up merge); the render-path dedup must
      // drop the durable copy or the list would have duplicate React keys.
      presence.history = [makeClimb('c2', 4), makeClimb('c1', 3)];
      historyPagination.olderHistory = [makeClimb('c1', 3, { name: 'Durable Variant' }), makeClimb('c0', 2)];

      const { getAllByText, getByText, queryByText } = render(
        createElement(BoardSheet, {
          open: true,
          boardLabel: 'Garage Wall',
          onClose: noop,
          onSwitchBoard: noop,
        }),
      );

      expect(getAllByText('Climb c1')).toHaveLength(1);
      expect(queryByText('Durable Variant')).toBeNull();
      expect(getByText('Climb c0')).not.toBeNull();
    });

    it('disables the button and swaps its label while loading', () => {
      presence.history = [makeClimb('c1', 3)];
      historyPagination.isLoadingOlder = true;

      const { getByText, queryByText } = render(
        createElement(BoardSheet, {
          open: true,
          boardLabel: 'Garage Wall',
          onClose: noop,
          onSwitchBoard: noop,
        }),
      );

      expect(queryByText(LOAD_MORE)).toBeNull();
      const button = getByText(LOADING_MORE).closest('button');
      expect(button?.disabled).toBe(true);
    });
  });
});
