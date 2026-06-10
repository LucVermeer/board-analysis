// @vitest-environment jsdom
import { render, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import type { ClimbQueueItem } from '@boardsesh/queue';
import type { BoardSerialConfig } from '@boardsesh/graphql/operations';
import type { ResolvedBoardEntry } from '../../lib/ble/resolve-serials';
import type { PickerState } from '../../lib/ble/use-board-bluetooth';

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

const alert = vi.hoisted(() => ({
  alert: vi.fn(),
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
      pickerState: null as PickerState | null,
      reconnectSerialForCurrentBoard: null,
    },
    useBoardBluetooth: vi.fn((options: BluetoothHookOptions) => {
      mock.options = options;
      return mock.state;
    }),
  };
  return mock;
});

type PickerSheetProps = {
  onSelect: (deviceId: string) => void;
};

const pickerSheet = vi.hoisted(() => ({
  props: null as PickerSheetProps | null,
}));

const resolvedBoards = vi.hoisted(() => ({
  value: new Map<string, ResolvedBoardEntry>(),
}));

vi.mock('react-native', () => ({
  Alert: { alert: alert.alert },
}));

vi.mock('@boardsesh/play-view', () => ({
  emitWallConfirm: wallConfirm.emitWallConfirm,
}));

vi.mock('../../lib/ble/use-board-bluetooth', () => ({
  useBoardBluetooth: bluetooth.useBoardBluetooth,
}));

vi.mock('../../lib/ble/resolve-serials', () => ({
  useResolvedBleDeviceBoards: () => resolvedBoards.value,
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
  DevicePickerSheet: (props: PickerSheetProps) => {
    pickerSheet.props = props;
    return createElement('div', { 'data-testid': 'device-picker' });
  },
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
      setIds: '1,20',
      children: children ?? createElement('div', null),
    }),
  );
}

function makeSerialConfig(overrides: Partial<BoardSerialConfig> = {}): BoardSerialConfig {
  return {
    serialNumber: 'SN-1',
    boardName: 'kilter',
    layoutId: 1,
    sizeId: 10,
    setIds: '1,20',
    apiLevel: 3,
    updatedAt: '2026-01-02T00:00:00.000Z',
    boardUuid: null,
    boardSlug: null,
    ...overrides,
  };
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
    alert.alert.mockClear();
    pickerSheet.props = null;
    resolvedBoards.value = new Map();
    bluetooth.options = undefined;
    bluetooth.state.isConnected = true;
    bluetooth.state.loading = false;
    bluetooth.state.pickerState = null;
    bluetooth.state.reconnectSerialForCurrentBoard = null;
    bluetooth.state.sendFramesToBoard.mockReset();
    bluetooth.state.sendFramesToBoard.mockResolvedValue(true);
    bluetooth.useBoardBluetooth.mockClear();
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

  it('forwards picker selection immediately when the resolved board config matches', () => {
    const handleSelect = vi.fn();
    bluetooth.state.pickerState = {
      devices: [{ deviceId: 'device-1', name: 'Kilter Board#SN-1@3', rssi: -40 }],
      isScanning: false,
      handleSelect,
      handleCancel: vi.fn(),
    };
    resolvedBoards.value = new Map([['SN-1', { kind: 'recorded', config: makeSerialConfig({ setIds: '20,1' }) }]]);

    renderProvider();
    pickerSheet.props?.onSelect('device-1');

    expect(handleSelect).toHaveBeenCalledWith('device-1');
    expect(alert.alert).not.toHaveBeenCalled();
  });

  it('asks before forwarding picker selection when the resolved board config mismatches', () => {
    const handleSelect = vi.fn();
    bluetooth.state.pickerState = {
      devices: [{ deviceId: 'device-2', name: 'Tension Board#SN-2@2', rssi: -50 }],
      isScanning: false,
      handleSelect,
      handleCancel: vi.fn(),
    };
    resolvedBoards.value = new Map([
      ['SN-2', { kind: 'recorded', config: makeSerialConfig({ serialNumber: 'SN-2', boardName: 'tension' }) }],
    ]);

    renderProvider();
    pickerSheet.props?.onSelect('device-2');

    expect(handleSelect).not.toHaveBeenCalled();
    expect(alert.alert).toHaveBeenCalledOnce();

    const buttons = alert.alert.mock.calls[0]?.[2] as Array<{ onPress?: () => void }> | undefined;
    buttons?.[1]?.onPress?.();
    expect(handleSelect).toHaveBeenCalledWith('device-2');
  });
});
