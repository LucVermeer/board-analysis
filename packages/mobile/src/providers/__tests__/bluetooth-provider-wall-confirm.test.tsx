// @vitest-environment jsdom
import { render, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import type { ClimbQueueItem } from '@boardsesh/queue';

type BluetoothHookOptions = {
  onConnectSuccess?: (serial: string | null) => void;
  holdsData?: unknown;
};

const wallConfirm = vi.hoisted(() => ({
  emitWallConfirm: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
}));

const queue = vi.hoisted(() => ({
  currentClimbQueueItem: null as ClimbQueueItem | null,
  sessionId: 'session-1' as string | null,
  lastConnectedBoardSerial: null as string | null,
  confirmClimbOnWall: vi.fn(async () => {}),
  setSessionBoardSerial: vi.fn(async () => {}),
}));

const bluetooth = vi.hoisted(() => {
  const mock = {
    options: undefined as BluetoothHookOptions | undefined,
    state: {
      isConnected: true,
      loading: false,
      connect: vi.fn(async () => true),
      disconnect: vi.fn(async () => {}),
      sendFramesToBoard: vi.fn(async () => true as boolean | undefined),
      pickerState: null,
      reconnectSerialForCurrentBoard: null,
    },
    useBoardBluetooth: vi.fn((options: BluetoothHookOptions) => {
      mock.options = options;
      return mock.state;
    }),
  };
  return mock;
});

vi.mock('@boardsesh/play-view', () => ({
  emitWallConfirm: wallConfirm.emitWallConfirm,
}));

const presence = vi.hoisted(() => ({
  enabled: false,
  boardId: null as number | null,
  resolveAndBindBoard: vi.fn(async () => null),
  reportClimb: vi.fn(async () => true),
  showUndoWallChangeSnackbar: vi.fn(),
}));

vi.mock('@boardsesh/board-presence-react', () => ({
  useBoardPresenceContext: () => ({ reportClimb: presence.reportClimb }),
}));

vi.mock('../board-presence-provider', () => ({
  useBoardPresenceControls: () => ({
    enabled: presence.enabled,
    boardId: presence.boardId,
    resolveAndBindBoard: presence.resolveAndBindBoard,
  }),
}));

vi.mock('../queue-snackbar-provider', () => ({
  useQueueSnackbar: () => ({ showUndoWallChangeSnackbar: presence.showUndoWallChangeSnackbar }),
}));

vi.mock('../../lib/climb-to-queue-item', () => ({
  toClimbInput: (climb: { uuid: string }) => ({ uuid: climb.uuid }),
}));

vi.mock('../../lib/ble/use-board-bluetooth', () => ({
  useBoardBluetooth: bluetooth.useBoardBluetooth,
}));

vi.mock('../../lib/ble/bluetooth-status-store', () => ({
  registerBluetoothConnection: vi.fn(() => vi.fn()),
}));

vi.mock('../../lib/haptics', () => ({
  hapticSuccess: vi.fn(),
  hapticError: vi.fn(),
}));

vi.mock('../../lib/analytics', () => ({
  track: analytics.track,
}));

vi.mock('../../components/ble/DevicePickerSheet', () => ({
  DevicePickerSheet: () => createElement('div', { 'data-testid': 'device-picker' }),
}));

vi.mock('../queue-provider', () => ({
  useQueue: () => ({
    state: { currentClimbQueueItem: queue.currentClimbQueueItem },
  }),
  useQueueSessionControls: () => ({
    sessionId: queue.sessionId,
    lastConnectedBoardSerial: queue.lastConnectedBoardSerial,
    confirmClimbOnWall: queue.confirmClimbOnWall,
    setSessionBoardSerial: queue.setSessionBoardSerial,
  }),
}));

const boardDetails = vi.hoisted(() => ({
  getBoardRenderData: vi.fn(() => ({
    holdsData: [{ id: 100, mirroredHoldId: 200, cx: 0, cy: 0, r: 1 }],
  })),
}));

vi.mock('../../lib/board-details', () => ({
  getBoardRenderData: boardDetails.getBoardRenderData,
}));

import { BluetoothProvider } from '../bluetooth-provider';

function makeQueueItem(uuid: string, frames = 'p1r12', mirrored = false): ClimbQueueItem {
  return {
    uuid: `queue-${uuid}`,
    climb: {
      uuid,
      name: `Climb ${uuid}`,
      frames,
      mirrored,
      setter_username: 'setter',
      angle: 40,
      ascensionist_count: 0,
      difficulty: 'V3',
      quality_average: '3.0',
      stars: 3,
      difficulty_error: '0.3',
      benchmark_difficulty: null,
    },
  };
}

function renderProvider(children?: ReactNode) {
  return render(
    createElement(BluetoothProvider, {
      boardName: 'kilter',
      layoutId: 1,
      sizeId: 10,
      children: children ?? createElement('div', null),
    }),
  );
}

describe('BluetoothProvider wall-confirm integration', () => {
  beforeEach(() => {
    queue.currentClimbQueueItem = makeQueueItem('climb-1');
    queue.sessionId = 'session-1';
    queue.lastConnectedBoardSerial = null;
    queue.confirmClimbOnWall.mockClear();
    queue.setSessionBoardSerial.mockClear();
    wallConfirm.emitWallConfirm.mockClear();
    analytics.track.mockClear();
    bluetooth.options = undefined;
    bluetooth.state.isConnected = true;
    bluetooth.state.loading = false;
    bluetooth.state.pickerState = null;
    bluetooth.state.reconnectSerialForCurrentBoard = null;
    bluetooth.state.sendFramesToBoard.mockReset();
    bluetooth.state.sendFramesToBoard.mockResolvedValue(true);
    bluetooth.useBoardBluetooth.mockClear();
    presence.enabled = false;
    presence.boardId = null;
    presence.resolveAndBindBoard.mockClear();
    presence.resolveAndBindBoard.mockResolvedValue(null);
    presence.reportClimb.mockClear();
    presence.reportClimb.mockResolvedValue(true);
    presence.showUndoWallChangeSnackbar.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('emits a local wall confirm and notifies party peers after a successful send', async () => {
    renderProvider();

    await waitFor(() => {
      expect(bluetooth.state.sendFramesToBoard).toHaveBeenCalledWith('p1r12', false, expect.any(AbortSignal));
    });

    expect(wallConfirm.emitWallConfirm).toHaveBeenCalledWith('climb-1');
    expect(queue.confirmClimbOnWall).toHaveBeenCalledWith('climb-1');
  });

  it('keeps the local wall confirm in solo mode without sending a session mutation', async () => {
    queue.sessionId = null;

    renderProvider();

    await waitFor(() => {
      expect(wallConfirm.emitWallConfirm).toHaveBeenCalledWith('climb-1');
    });

    expect(queue.confirmClimbOnWall).not.toHaveBeenCalled();
  });

  it('does not confirm the wall when the BLE write fails', async () => {
    bluetooth.state.sendFramesToBoard.mockResolvedValue(false);

    renderProvider();

    await waitFor(() => {
      expect(bluetooth.state.sendFramesToBoard).toHaveBeenCalledOnce();
    });

    expect(wallConfirm.emitWallConfirm).not.toHaveBeenCalled();
    expect(queue.confirmClimbOnWall).not.toHaveBeenCalled();
  });

  it('re-emits wall confirm on byte-identical duplicate broadcasts without another BLE write', async () => {
    const firstItem = makeQueueItem('climb-1');
    queue.currentClimbQueueItem = firstItem;
    const { rerender } = renderProvider();

    await waitFor(() => {
      expect(wallConfirm.emitWallConfirm).toHaveBeenCalledTimes(1);
    });

    queue.currentClimbQueueItem = { ...firstItem };
    rerender(
      createElement(BluetoothProvider, {
        boardName: 'kilter',
        layoutId: 1,
        sizeId: 10,
        children: createElement('div', null),
      }),
    );

    await waitFor(() => {
      expect(wallConfirm.emitWallConfirm).toHaveBeenCalledTimes(2);
    });

    expect(bluetooth.state.sendFramesToBoard).toHaveBeenCalledTimes(1);
    expect(queue.confirmClimbOnWall).toHaveBeenCalledTimes(2);
  });

  it('stores a newly connected board serial on active sessions', () => {
    renderProvider();

    bluetooth.options?.onConnectSuccess?.('SERIAL-1');

    expect(queue.setSessionBoardSerial).toHaveBeenCalledWith('SERIAL-1');
    expect(analytics.track).toHaveBeenCalledWith('Session Board Serial Set', {
      mode: 'party',
      previousSerialKnown: false,
      boardLayout: 'kilter',
    });
  });

  it('suppresses board serial writes outside sessions or when the serial is unchanged', () => {
    queue.sessionId = null;
    renderProvider();

    bluetooth.options?.onConnectSuccess?.('SERIAL-1');
    expect(queue.setSessionBoardSerial).not.toHaveBeenCalled();

    queue.sessionId = 'session-1';
    queue.lastConnectedBoardSerial = 'SERIAL-1';
    cleanup();
    renderProvider();

    bluetooth.options?.onConnectSuccess?.('SERIAL-1');
    expect(queue.setSessionBoardSerial).not.toHaveBeenCalled();
  });

  it('threads the active board holds into the hook so mirrored sends can convert', () => {
    render(
      createElement(BluetoothProvider, {
        boardName: 'kilter',
        layoutId: 1,
        sizeId: 10,
        setIds: '26, 27',
        children: createElement('div', null),
      }),
    );

    expect(boardDetails.getBoardRenderData).toHaveBeenCalledWith({
      boardName: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: [26, 27],
    });
    expect((bluetooth.options as { holdsData?: unknown } | undefined)?.holdsData).toEqual([
      { id: 100, mirroredHoldId: 200, cx: 0, cy: 0, r: 1 },
    ]);
  });

  describe('board-presence wiring (flag on)', () => {
    it('resolves+binds the board on connect with the active board config', () => {
      presence.enabled = true;
      renderProvider();

      bluetooth.options?.onConnectSuccess?.('SERIAL-1');

      expect(presence.resolveAndBindBoard).toHaveBeenCalledWith({
        serial: 'SERIAL-1',
        boardType: 'kilter',
        layoutId: 1,
        sizeId: 10,
        setIds: '',
      });
    });

    it('does NOT resolve the board on connect when the flag is off', () => {
      presence.enabled = false;
      renderProvider();

      bluetooth.options?.onConnectSuccess?.('SERIAL-1');

      expect(presence.resolveAndBindBoard).not.toHaveBeenCalled();
    });

    it('reports the lit climb to the wall on wall-confirm, in a SOLO flow, then shows the Undo snackbar', async () => {
      presence.enabled = true;
      presence.boardId = 99;
      queue.sessionId = null; // solo — no session

      renderProvider();

      await waitFor(() => {
        expect(presence.reportClimb).toHaveBeenCalledTimes(1);
      });
      // Reported the lit climb (the queue item) with its angle; no session needed.
      expect(presence.reportClimb).toHaveBeenCalledWith({ uuid: 'queue-climb-1', climb: { uuid: 'climb-1' } }, 40);
      expect(queue.confirmClimbOnWall).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(presence.showUndoWallChangeSnackbar).toHaveBeenCalledTimes(1);
      });
    });

    it('does NOT report to the wall when no board is bound', async () => {
      presence.enabled = true;
      presence.boardId = null;

      renderProvider();

      await waitFor(() => {
        expect(wallConfirm.emitWallConfirm).toHaveBeenCalled();
      });
      expect(presence.reportClimb).not.toHaveBeenCalled();
      expect(presence.showUndoWallChangeSnackbar).not.toHaveBeenCalled();
    });

    it('does NOT report to the wall when the flag is off', async () => {
      presence.enabled = false;
      presence.boardId = 99;

      renderProvider();

      await waitFor(() => {
        expect(wallConfirm.emitWallConfirm).toHaveBeenCalled();
      });
      expect(presence.reportClimb).not.toHaveBeenCalled();
    });
  });
});
