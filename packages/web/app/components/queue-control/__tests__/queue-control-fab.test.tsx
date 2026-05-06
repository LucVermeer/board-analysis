import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import QueueControlFab from '../queue-control-fab';

// react-i18next must be mocked so component-level t() calls resolve to the
// real English copy and assertions can match what users see.
vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string | readonly string[]) => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
  }),
}));

// useGradeFormat: synchronous so the grade FAB has a label on first render.
vi.mock('@/app/hooks/use-grade-format', () => ({
  useGradeFormat: () => ({
    formatGrade: (difficulty: string | null | undefined) => (difficulty ? `V${difficulty}` : null),
    getGradeColor: () => '#444444',
    loaded: true,
    gradeFormat: 'v-grade',
    setGradeFormat: vi.fn(),
  }),
}));

vi.mock('@/app/hooks/use-is-dark-mode', () => ({
  useIsDarkMode: () => false,
}));

let mockBluetoothCtx: { isConnected: boolean; isBluetoothSupported: boolean; connect: () => void } = {
  isConnected: false,
  isBluetoothSupported: true,
  connect: vi.fn(),
};
vi.mock('@/app/components/board-bluetooth-control/bluetooth-context', () => ({
  useBluetoothContext: () => mockBluetoothCtx,
}));

vi.mock('@/app/components/climb-card/climb-thumbnail', () => ({
  default: () => React.createElement('div', { 'data-testid': 'climb-thumbnail' }),
}));

vi.mock('@/app/components/logbook/tick-icon', () => ({
  TickIcon: () => React.createElement('span', { 'data-testid': 'tick-icon' }),
}));

vi.mock('@/app/lib/grade-colors', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Stable, non-null tint so the FAB picks the colorized branch.
    getGradeTintColor: () => '#aabbcc',
  };
});

const mockClimb = {
  uuid: 'climb-1',
  setter_username: 'setter1',
  name: 'Test Climb',
  description: '',
  frames: '',
  angle: 40,
  ascensionist_count: 5,
  difficulty: '7',
  quality_average: '3.5',
  stars: 3,
  difficulty_error: '',
  mirrored: false,
  benchmark_difficulty: null,
  userAscents: 0,
  userAttempts: 0,
};

const baseBoardDetails = {
  board_name: 'kilter',
  layout_id: 1,
  size_id: 1,
  set_ids: '1',
  images_to_holds: {},
  layout_name: 'Original',
  size_name: '12x12',
  size_description: 'Standard',
  set_names: ['Base'],
  edge_left: 0,
  edge_right: 0,
  edge_bottom: 0,
  edge_top: 0,
} as never;

type Handlers = {
  onExpandFromGrade: () => void;
  onOpenPlayView: () => void;
  onExpandFromTick: () => void;
  onExpandFromQueue: () => void;
};

function makeHandlers(): Handlers {
  return {
    onExpandFromGrade: vi.fn(),
    onOpenPlayView: vi.fn(),
    onExpandFromTick: vi.fn(),
    onExpandFromQueue: vi.fn(),
  };
}

describe('QueueControlFab', () => {
  beforeEach(() => {
    mockBluetoothCtx = {
      isConnected: false,
      isBluetoothSupported: true,
      connect: vi.fn(),
    };
  });

  it('returns null when there is no current climb', () => {
    const handlers = makeHandlers();
    const { container } = render(
      <QueueControlFab
        mode="minimised"
        currentClimb={null}
        boardDetails={baseBoardDetails}
        pathname="/kilter/1/1/1/40/view/abc"
        {...handlers}
      />,
    );

    expect(container.querySelector('[data-testid="queue-control-fab"]')).toBeNull();
    expect(document.querySelector('[data-testid="queue-control-fab"]')).toBeNull();
  });

  it('renders the FAB cluster (via portal) when minimised', () => {
    const handlers = makeHandlers();
    render(
      <QueueControlFab
        mode="minimised"
        currentClimb={mockClimb}
        boardDetails={baseBoardDetails}
        pathname="/kilter/1/1/1/40/view/abc"
        {...handlers}
      />,
    );

    const cluster = screen.getByTestId('queue-control-fab');
    expect(cluster).toBeTruthy();
    expect(cluster.getAttribute('aria-hidden')).toBe('false');
  });

  it('marks the cluster aria-hidden when mode is hidden', () => {
    const handlers = makeHandlers();
    render(
      <QueueControlFab
        mode="hidden"
        currentClimb={mockClimb}
        boardDetails={baseBoardDetails}
        pathname="/kilter/1/1/1/40/view/abc"
        {...handlers}
      />,
    );

    const cluster = screen.getByTestId('queue-control-fab');
    expect(cluster.getAttribute('aria-hidden')).toBe('true');
  });

  it('fires handlers when each FAB is tapped', () => {
    const handlers = makeHandlers();
    render(
      <QueueControlFab
        mode="minimised"
        currentClimb={mockClimb}
        boardDetails={baseBoardDetails}
        pathname="/kilter/1/1/1/40/view/abc"
        {...handlers}
      />,
    );

    fireEvent.click(screen.getByLabelText('Open climb details'));
    fireEvent.click(screen.getByLabelText('Expand queue control'));
    fireEvent.click(screen.getByLabelText('Open queue'));
    fireEvent.click(screen.getByLabelText('Save tick'));

    expect(handlers.onOpenPlayView).toHaveBeenCalledTimes(1);
    expect(handlers.onExpandFromGrade).toHaveBeenCalledTimes(1);
    expect(handlers.onExpandFromQueue).toHaveBeenCalledTimes(1);
    expect(handlers.onExpandFromTick).toHaveBeenCalledTimes(1);
  });

  it('only renders the bluetooth FAB when supported and not connected', () => {
    const handlers = makeHandlers();
    const { rerender } = render(
      <QueueControlFab
        mode="minimised"
        currentClimb={mockClimb}
        boardDetails={baseBoardDetails}
        pathname="/kilter/1/1/1/40/view/abc"
        {...handlers}
      />,
    );

    expect(screen.queryByLabelText('Connect to board')).toBeTruthy();

    // Already connected → no FAB
    mockBluetoothCtx = { ...mockBluetoothCtx, isConnected: true };
    rerender(
      <QueueControlFab
        mode="minimised"
        currentClimb={mockClimb}
        boardDetails={baseBoardDetails}
        pathname="/kilter/1/1/1/40/view/abc"
        {...handlers}
      />,
    );
    expect(screen.queryByLabelText('Connect to board')).toBeNull();

    // Bluetooth not supported (e.g. iOS Safari) → no FAB
    mockBluetoothCtx = { isConnected: false, isBluetoothSupported: false, connect: vi.fn() };
    rerender(
      <QueueControlFab
        mode="minimised"
        currentClimb={mockClimb}
        boardDetails={baseBoardDetails}
        pathname="/kilter/1/1/1/40/view/abc"
        {...handlers}
      />,
    );
    expect(screen.queryByLabelText('Connect to board')).toBeNull();
  });

  it('triggers bluetooth connect when the lightbulb FAB is tapped', () => {
    const connect = vi.fn();
    mockBluetoothCtx = { isConnected: false, isBluetoothSupported: true, connect };
    const handlers = makeHandlers();
    render(
      <QueueControlFab
        mode="minimised"
        currentClimb={mockClimb}
        boardDetails={baseBoardDetails}
        pathname="/kilter/1/1/1/40/view/abc"
        {...handlers}
      />,
    );

    fireEvent.click(screen.getByLabelText('Connect to board'));
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('mounts the peek snackbar while peeking and keeps it during the exit animation', () => {
    vi.useFakeTimers();
    try {
      const handlers = makeHandlers();
      const { rerender } = render(
        <QueueControlFab
          mode="minimised"
          currentClimb={mockClimb}
          boardDetails={baseBoardDetails}
          pathname="/kilter/1/1/1/40/view/abc"
          {...handlers}
        />,
      );

      // Minimised → no snackbar.
      expect(screen.queryByText('Test Climb')).toBeNull();

      // Switch to peeking → snackbar mounts with name + setter byline.
      rerender(
        <QueueControlFab
          mode="peeking"
          currentClimb={mockClimb}
          boardDetails={baseBoardDetails}
          pathname="/kilter/1/1/1/40/view/abc"
          {...handlers}
        />,
      );
      expect(screen.getByText('Test Climb')).toBeTruthy();
      expect(screen.getByText(/setter1/)).toBeTruthy();

      // Returning to minimised: the snackbar stays mounted (exit animation),
      // then unmounts after the SNACKBAR_EXIT_MS (200ms) timeout.
      rerender(
        <QueueControlFab
          mode="minimised"
          currentClimb={mockClimb}
          boardDetails={baseBoardDetails}
          pathname="/kilter/1/1/1/40/view/abc"
          {...handlers}
        />,
      );
      // Still in the DOM during the exit phase.
      expect(screen.queryByText('Test Climb')).toBeTruthy();

      // Advance past the exit timeout — snackbar unmounts.
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(screen.queryByText('Test Climb')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('omits the byline when the climb has no setter username', () => {
    const handlers = makeHandlers();
    const climbWithoutSetter = { ...mockClimb, setter_username: '' };
    render(
      <QueueControlFab
        mode="peeking"
        currentClimb={climbWithoutSetter}
        boardDetails={baseBoardDetails}
        pathname="/kilter/1/1/1/40/view/abc"
        {...handlers}
      />,
    );

    expect(screen.getByText('Test Climb')).toBeTruthy();
    expect(screen.queryByText(/By /)).toBeNull();
  });
});
