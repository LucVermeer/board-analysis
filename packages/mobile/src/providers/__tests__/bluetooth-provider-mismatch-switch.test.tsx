// @vitest-environment jsdom
import { render, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import type { ClimbQueueItem } from '@boardsesh/queue';
import type { BoardSerialConfig } from '@boardsesh/graphql/operations';
import type { UserBoard } from '@boardsesh/shared-schema';
import type { ResolvedBoardEntry } from '../../lib/ble/resolve-serials';
import type { PickerState } from '../../lib/ble/use-board-bluetooth';

type BluetoothHookOptions = {
  onConnectSuccess?: (serial: string | null) => void;
  holdsData?: unknown;
};

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
}));

const alert = vi.hoisted(() => ({
  alert: vi.fn(),
}));

const queue = vi.hoisted(() => ({
  currentClimbQueueItem: null as ClimbQueueItem | null,
  sessionId: null as string | null,
  lastConnectedBoardSerial: null as string | null,
  confirmClimbOnWall: vi.fn(async () => {}),
  setSessionBoardSerial: vi.fn(async () => {}),
}));

const bluetooth = vi.hoisted(() => {
  const mock = {
    options: undefined as BluetoothHookOptions | undefined,
    state: {
      isConnected: false,
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

const activeBoard = vi.hoisted(() => ({
  setActiveBoard: vi.fn(async (_board: unknown) => {}),
}));

const graphql = vi.hoisted(() => ({
  request: vi.fn(async () => ({ board: null as unknown })),
}));

vi.mock('react-native', () => ({
  Alert: { alert: alert.alert },
}));

vi.mock('@boardsesh/play-view', () => ({
  emitWallConfirm: vi.fn(),
}));

vi.mock('../../lib/ble/use-board-bluetooth', () => ({
  // Mirror the real pure helper so the provider's config-key comparisons work
  // without importing the hook module (which pulls in expo native modules).
  boardConfigKey: (boardName: string, layoutId: number, sizeId: number) => `${boardName}::${layoutId}::${sizeId}`,
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

vi.mock('../../lib/graphql/use-active-board', () => ({
  useSetActiveBoard: () => activeBoard.setActiveBoard,
}));

vi.mock('../../lib/graphql/client', () => ({
  getHttpClient: () => ({ request: graphql.request }),
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

vi.mock('../../lib/board-details', () => ({
  getBoardRenderData: vi.fn(() => ({
    holdsData: [{ id: 100, mirroredHoldId: 200, cx: 0, cy: 0, r: 1 }],
  })),
}));

import { BluetoothProvider } from '../bluetooth-provider';

function makeBoard(overrides: Partial<UserBoard> = {}): UserBoard {
  return {
    uuid: 'board-tension',
    slug: 'garage-tension',
    ownerId: 'owner-1',
    boardType: 'tension',
    layoutId: 1,
    sizeId: 10,
    setIds: '1',
    name: 'Garage Tension',
    isPublic: false,
    isUnlisted: false,
    hideLocation: false,
    isOwned: true,
    angle: 40,
    isAngleAdjustable: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    totalAscents: 0,
    uniqueClimbers: 0,
    followerCount: 0,
    commentCount: 0,
    isFollowedByMe: false,
    serialNumber: 'SN-2',
    ...overrides,
  };
}

function makeSerialConfig(overrides: Partial<BoardSerialConfig> = {}): BoardSerialConfig {
  return {
    serialNumber: 'SN-2',
    boardName: 'tension',
    layoutId: 1,
    sizeId: 10,
    setIds: '1',
    apiLevel: 3,
    updatedAt: '2026-01-02T00:00:00.000Z',
    boardUuid: null,
    boardSlug: null,
    ...overrides,
  };
}

function makeMismatchingPickerState(): PickerState {
  return {
    devices: [{ deviceId: 'device-2', name: 'Tension Board#SN-2@2', rssi: -50 }],
    isScanning: false,
    handleSelect: vi.fn(),
    handleCancel: vi.fn(),
  };
}

type BoardProps = {
  boardName?: string;
  layoutId?: number;
  sizeId?: number;
  setIds?: string;
};

const KILTER_PROPS: BoardProps = { boardName: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,20' };
const TENSION_PROPS: BoardProps = { boardName: 'tension', layoutId: 1, sizeId: 10, setIds: '1' };

function renderProvider(props: BoardProps, children?: ReactNode) {
  return render(
    createElement(BluetoothProvider, {
      ...props,
      children: children ?? createElement('div', null),
    }),
  );
}

type AlertButton = { text: string; style?: string; onPress?: () => void };

function lastAlertButtons(): AlertButton[] {
  const calls = alert.alert.mock.calls;
  const lastCall = calls[calls.length - 1];
  return (lastCall?.[2] as AlertButton[]) ?? [];
}

describe('BluetoothProvider mismatch switch', () => {
  beforeEach(() => {
    queue.currentClimbQueueItem = null;
    queue.sessionId = null;
    queue.lastConnectedBoardSerial = null;
    analytics.track.mockClear();
    alert.alert.mockClear();
    pickerSheet.props = null;
    resolvedBoards.value = new Map();
    activeBoard.setActiveBoard.mockClear();
    activeBoard.setActiveBoard.mockResolvedValue(undefined);
    graphql.request.mockClear();
    graphql.request.mockResolvedValue({ board: null });
    bluetooth.options = undefined;
    bluetooth.state.isConnected = false;
    bluetooth.state.loading = false;
    bluetooth.state.pickerState = null;
    bluetooth.state.reconnectSerialForCurrentBoard = null;
    bluetooth.state.connect.mockClear();
    bluetooth.state.connect.mockResolvedValue(true);
    bluetooth.useBoardBluetooth.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows three buttons for a mismatching saved board (Cancel / Connect anyway / Switch)', () => {
    bluetooth.state.pickerState = makeMismatchingPickerState();
    resolvedBoards.value = new Map([['SN-2', { kind: 'saved', board: makeBoard() }]]);

    renderProvider(KILTER_PROPS);
    pickerSheet.props?.onSelect('device-2');

    expect(alert.alert).toHaveBeenCalledOnce();
    const buttons = lastAlertButtons();
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.style).toBe('cancel');
    expect(buttons[1]?.style).toBe('destructive');
    expect(buttons[2]?.text).toBeTruthy();
  });

  it('switches the active board and silently auto-connects once after the config matches', async () => {
    const pickerState = makeMismatchingPickerState();
    bluetooth.state.pickerState = pickerState;
    const savedBoard = makeBoard();
    resolvedBoards.value = new Map([['SN-2', { kind: 'saved', board: savedBoard }]]);

    const { rerender } = renderProvider(KILTER_PROPS);
    pickerSheet.props?.onSelect('device-2');

    const switchButton = lastAlertButtons()[2];
    expect(switchButton).toBeDefined();
    switchButton?.onPress?.();

    await waitFor(() => {
      expect(activeBoard.setActiveBoard).toHaveBeenCalledWith(savedBoard);
    });
    expect(pickerState.handleCancel).toHaveBeenCalledOnce();
    // Still on the old (kilter) config — must not auto-connect yet.
    expect(bluetooth.state.connect).not.toHaveBeenCalled();

    // setActiveBoard's cache write propagates new board props into the provider.
    rerender(
      createElement(BluetoothProvider, {
        ...TENSION_PROPS,
        children: createElement('div', null),
      }),
    );

    await waitFor(() => {
      expect(bluetooth.state.connect).toHaveBeenCalledWith(undefined, undefined, 'SN-2');
    });
    expect(bluetooth.state.connect).toHaveBeenCalledOnce();

    // A further re-render must not re-fire the one-shot auto-connect.
    rerender(
      createElement(BluetoothProvider, {
        ...TENSION_PROPS,
        children: createElement('div', null),
      }),
    );
    expect(bluetooth.state.connect).toHaveBeenCalledOnce();
  });

  it('omits the Switch button for a recorded config with no saved board uuid', () => {
    bluetooth.state.pickerState = makeMismatchingPickerState();
    resolvedBoards.value = new Map([['SN-2', { kind: 'recorded', config: makeSerialConfig({ boardUuid: null }) }]]);

    renderProvider(KILTER_PROPS);
    pickerSheet.props?.onSelect('device-2');

    expect(alert.alert).toHaveBeenCalledOnce();
    expect(lastAlertButtons()).toHaveLength(2);
  });

  it('surfaces the switch-failed alert and keeps the picker open when setActiveBoard rejects', async () => {
    const pickerState = makeMismatchingPickerState();
    bluetooth.state.pickerState = pickerState;
    resolvedBoards.value = new Map([['SN-2', { kind: 'saved', board: makeBoard() }]]);
    activeBoard.setActiveBoard.mockRejectedValue(new Error('storage failed'));

    renderProvider(KILTER_PROPS);
    pickerSheet.props?.onSelect('device-2');
    lastAlertButtons()[2]?.onPress?.();

    await waitFor(() => {
      // The first alert is the mismatch prompt; the second is the failure.
      expect(alert.alert).toHaveBeenCalledTimes(2);
    });
    // react-i18next is unconfigured in tests, so `t` echoes the key.
    const failureCall = alert.alert.mock.calls[1];
    expect(failureCall?.[0]).toBe('boardConfigMismatch.title');
    expect(failureCall?.[1]).toBe('boardConfigMismatch.mobileSwitchFailed');
    expect(bluetooth.state.connect).not.toHaveBeenCalled();
    // The picker is only cancelled once the switch goes through — on failure it
    // stays open so the user can still pick a device or use Connect anyway.
    expect(pickerState.handleCancel).not.toHaveBeenCalled();
  });
});
