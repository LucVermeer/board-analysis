import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { render, act } from '@testing-library/react';

// Echo i18n keys so assertions can match on the key directly.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

const mockShowMessage = vi.fn();
vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: mockShowMessage }),
}));

// Keep the heavy drawer chrome out of the way — the failure-guard logic lives
// in the component's effects, not its rendered children.
vi.mock('@/app/components/swipeable-drawer/swipeable-drawer', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/app/lib/led-color-overrides-db', () => ({
  CUSTOMISABLE_LED_ROLES: ['HAND', 'FOOT', 'FINISH'],
}));

const mockSendFramesToBoard = vi.fn<(frames: string) => Promise<boolean | undefined>>();
const mockSetPartyMode = vi.fn();
const mockClearBoard = vi.fn(() => Promise.resolve(true));

let mockBtContext: Record<string, unknown>;
vi.mock('../../board-bluetooth-control/bluetooth-context', () => ({
  useBluetoothContext: () => mockBtContext,
}));

vi.mock('../../graphql-queue', () => ({
  useCurrentClimb: () => ({ currentClimbQueueItem: null }),
}));

import { LightControlDrawer } from '../light-control-drawer';
import type { BoardDetails } from '@/app/lib/types';

const boardDetails = {
  board_name: 'kilter',
  holdsData: [],
  edge_left: 0,
  edge_right: 100,
  edge_top: 100,
  edge_bottom: 0,
} as unknown as BoardDetails;

describe('LightControlDrawer light-show failure guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockBtContext = {
      isConnected: true,
      sendFramesToBoard: mockSendFramesToBoard,
      clearBoard: mockClearBoard,
      disconnect: vi.fn(),
      // boardDetails now comes in as a prop, not from the BLE context.
      partyMode: 'glyphs',
      setPartyMode: mockSetPartyMode,
      ledColorOverrides: {},
      setLedColorOverrides: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops the party show and warns after repeated failed writes', async () => {
    // Every write fails — a dead connection while the show is running.
    mockSendFramesToBoard.mockResolvedValue(false);

    render(<LightControlDrawer open onClose={() => {}} boardDetails={boardDetails} />);

    // Mount tick (failure 1) + one interval tick (failure 2) trips the guard.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });

    expect(mockSetPartyMode).toHaveBeenCalledWith('off');
    expect(mockShowMessage).toHaveBeenCalledWith('lightControl.lightShowFailed', 'error');
  });

  it('keeps the show running while writes succeed', async () => {
    mockSendFramesToBoard.mockResolvedValue(true);

    render(<LightControlDrawer open onClose={() => {}} boardDetails={boardDetails} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });

    expect(mockSetPartyMode).not.toHaveBeenCalled();
    expect(mockShowMessage).not.toHaveBeenCalledWith('lightControl.lightShowFailed', 'error');
    // It did keep sending frames each tick.
    expect(mockSendFramesToBoard.mock.calls.length).toBeGreaterThan(1);
  });
});
