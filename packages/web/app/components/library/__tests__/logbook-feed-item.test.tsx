import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import type { AscentFeedItem } from '@boardsesh/graphql/operations/ticks';
import type { BoardDetails, Climb } from '@/app/lib/types';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import { LogbookEntryEditor, LogbookEntryMenu, LogbookEntryMeta } from '../logbook-feed-item';

vi.mock('react-i18next', () => ({
  useTranslation: (namespace?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(namespace, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

const updateTickMocks = vi.hoisted(() => ({
  updateTickAsyncMock: vi.fn(),
  updateTickState: { isPending: false },
}));
const boardDataMocks = vi.hoisted(() => ({
  getGradesForBoard: vi.fn((boardName: string) =>
    boardName === 'moonboard'
      ? [{ difficulty_id: 18, difficulty_name: '6b/V4', v_grade: 'V4' }]
      : [{ difficulty_id: 20, difficulty_name: '7a/V6', v_grade: 'V6' }],
  ),
}));

vi.mock('../logbook-feed-item.module.css', () => ({
  default: new Proxy({}, { get: (_target, property) => String(property) }),
}));

vi.mock('@/app/components/swipeable-drawer/swipeable-drawer.module.css', () => ({
  default: new Proxy({}, { get: (_target, property) => String(property) }),
}));

vi.mock('@/app/components/ascent-status/ascent-status-icon', () => ({
  AscentStatusIcon: ({ status }: { status: string }) => <span data-testid="status-icon">{status}</span>,
}));

vi.mock('@/app/components/climb-actions', () => ({
  ClimbActions: () => <div data-testid="climb-actions" />,
}));

vi.mock('@/app/components/climb-card/drawer-climb-header', () => ({
  default: () => <div data-testid="drawer-climb-header" />,
}));

vi.mock('@/app/hooks/use-update-tick', () => ({
  useUpdateTick: () => ({
    mutateAsync: updateTickMocks.updateTickAsyncMock,
    get isPending() {
      return updateTickMocks.updateTickState.isPending;
    },
  }),
}));

vi.mock('@/app/hooks/use-drawer-drag-resize', () => ({
  useDrawerDragResize: () => ({
    paperRef: { current: null },
    dragHandlers: {},
  }),
}));

vi.mock('@/app/hooks/use-is-dark-mode', () => ({
  useIsDarkMode: () => false,
}));

vi.mock('@/app/hooks/use-grade-format', () => ({
  useGradeFormat: () => ({
    formatGrade: (grade: string) => grade,
    getGradeColor: () => '#888',
  }),
}));

vi.mock('@/app/lib/board-data', () => ({
  getGradesForBoard: boardDataMocks.getGradesForBoard,
}));

vi.mock('@/app/lib/climb-action-utils', () => ({
  getExcludedClimbActions: () => [],
}));

vi.mock('../../logbook/tick-controls', () => ({
  InlineStarPicker: ({ onSelect }: { onSelect: (quality: number | null) => void }) => (
    <button type="button" data-testid="inline-star-picker" onClick={() => onSelect(3)}>
      stars
    </button>
  ),
  InlineGradePicker: ({ onSelect }: { onSelect: (difficulty: number) => void }) => (
    <button type="button" data-testid="inline-grade-picker" onClick={() => onSelect(21)}>
      grade
    </button>
  ),
  InlineTriesPicker: ({ onSelect }: { onSelect: (attemptCount: number) => void }) => (
    <button type="button" data-testid="inline-tries-picker" onClick={() => onSelect(5)}>
      tries
    </button>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicMock({ children, open }: { children?: React.ReactNode; open?: boolean }) {
      return open ? <div data-testid="mock-drawer">{children}</div> : null;
    },
}));

function makeItem(overrides: Partial<AscentFeedItem> = {}): AscentFeedItem {
  return {
    uuid: 'tick-1',
    climbUuid: 'climb-1',
    climbName: 'Test Climb',
    setterUsername: null,
    boardType: 'kilter',
    layoutId: 1,
    angle: 40,
    isMirror: false,
    status: 'send',
    attemptCount: 2,
    quality: 4,
    difficulty: 20,
    difficultyName: '7a/V6',
    consensusDifficulty: 20,
    consensusDifficultyName: '7a/V6',
    qualityAverage: 3.5,
    isBenchmark: false,
    isNoMatch: false,
    comment: 'Nice send!',
    climbedAt: new Date('2026-04-01T12:00:00Z').toISOString(),
    frames: 'p1r14',
    ...overrides,
  };
}

function makeClimb(): Climb {
  return {
    uuid: 'climb-1',
    name: 'Test Climb',
    setter_username: '',
    frames: 'p1r14',
    angle: 40,
    ascensionist_count: 0,
    difficulty: '7a/V6',
    quality_average: '3.5',
    stars: 0,
    difficulty_error: '0',
    benchmark_difficulty: null,
  };
}

function makeBoardDetails(): BoardDetails {
  return {
    board_name: 'kilter',
    layout_id: 1,
    size_id: 10,
    set_ids: [1],
    images_to_holds: {},
    holdsData: [],
    edge_left: 0,
    edge_right: 100,
    edge_bottom: 0,
    edge_top: 100,
    boardHeight: 100,
    boardWidth: 100,
  };
}

beforeEach(() => {
  updateTickMocks.updateTickAsyncMock.mockReset();
  updateTickMocks.updateTickState.isPending = false;
  boardDataMocks.getGradesForBoard.mockClear();
});

describe('Logbook entry slots', () => {
  it('renders tries, board name, angle, and comment metadata', () => {
    render(<LogbookEntryMeta item={makeItem()} />);

    expect(screen.getByText(/2 tries/)).toBeDefined();
    expect(screen.getByText(/Kilter Original/)).toBeDefined();
    expect(screen.getByText(/40°/)).toBeDefined();
    expect(screen.getByText('Nice send!')).toBeDefined();
  });

  it('saves inline edit state and closes after a successful update', async () => {
    updateTickMocks.updateTickAsyncMock.mockResolvedValue({ uuid: 'tick-1' });
    const onCancelEdit = vi.fn();

    render(<LogbookEntryEditor item={makeItem()} onCancelEdit={onCancelEdit} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Save'));
    });

    expect(updateTickMocks.updateTickAsyncMock).toHaveBeenCalledWith({
      uuid: 'tick-1',
      input: {
        status: 'send',
        attemptCount: 2,
        quality: 4,
        difficulty: 20,
        comment: 'Nice send!',
      },
    });
    expect(onCancelEdit).toHaveBeenCalledOnce();
  });

  it('preserves quality when the status changes to attempt', async () => {
    updateTickMocks.updateTickAsyncMock.mockResolvedValue({ uuid: 'tick-1' });

    render(<LogbookEntryEditor item={makeItem()} />);

    fireEvent.click(screen.getByLabelText(/Change ascent status/));
    fireEvent.click(screen.getByText('Attempt'));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Save'));
    });

    expect(updateTickMocks.updateTickAsyncMock).toHaveBeenCalledWith({
      uuid: 'tick-1',
      input: expect.objectContaining({ status: 'attempt', quality: 4 }),
    });
  });

  it('uses board-specific grade options in edit mode', () => {
    render(
      <LogbookEntryEditor
        item={makeItem({
          boardType: 'moonboard',
          layoutId: 5,
          difficulty: 18,
          difficultyName: null,
          consensusDifficulty: null,
          consensusDifficultyName: null,
        })}
      />,
    );

    expect(boardDataMocks.getGradesForBoard).toHaveBeenCalledWith('moonboard');
    expect(screen.getByText('6b/V4')).toBeDefined();
  });

  it('keeps the edit drawer actions in the menu slot', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const item = makeItem();

    render(
      <LogbookEntryMenu
        item={item}
        climb={makeClimb()}
        boardDetails={makeBoardDetails()}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Edit log'));
    expect(onEdit).toHaveBeenCalledWith(item);

    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Delete log'));
    expect(onDelete).toHaveBeenCalledWith('tick-1');
  });
});
