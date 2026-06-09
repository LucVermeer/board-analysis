// Board-presence BLE wiring: on connect → resolveAndBindBoard, and on
// wall-confirm → reportClimb + Undo snackbar. Mirrors the mobile
// bluetooth-provider's presence coverage. All flag-gated: the report/resolve
// paths are inert when `enabled` is false, so the BLE flow behaves as today.

import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import type { BoardDetails } from '@/app/lib/types';
import type { ClimbQueueItem } from '../../queue-control/types';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('@/app/lib/analytics', () => ({ track: vi.fn() }));

// Mutable BLE state + captured callbacks so the test can drive connect and the
// AutoSender without a real adapter.
const ble = vi.hoisted(() => ({ isConnected: false }));
let lastConnectSuccess: ((serial: string | null) => void) | null = null;
const mockSendFrames = vi.fn().mockResolvedValue(true);
vi.mock('../use-board-bluetooth', () => ({
  useBoardBluetooth: (options: { onConnectSuccess?: (serial: string | null) => void }) => {
    lastConnectSuccess = options.onConnectSuccess ?? null;
    return {
      isConnected: ble.isConnected,
      loading: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      sendFramesToBoard: mockSendFrames,
      pickerState: null,
      reconnectSerialForCurrentBoard: null,
    };
  },
}));

vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => ({ token: null, isAuthenticated: false, isLoading: false, error: null }),
}));

vi.mock('@/app/lib/ble/resolve-serials', () => ({ resolveSerialNumbers: vi.fn().mockResolvedValue(new Map()) }));
vi.mock('../bluetooth-aurora', () => ({ parseSerialNumber: (name: string) => name }));
vi.mock('../device-picker-dialog', () => ({ DevicePickerDialog: () => null }));
vi.mock('../board-config-mismatch-dialog', () => ({ BoardConfigMismatchDialog: () => null }));
vi.mock('../auto-connect-handler', () => ({ AutoConnectHandler: () => null }));
vi.mock('@/app/lib/i18n/use-locale-router', () => ({ useLocaleRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useParams: () => ({ angle: '40' }) }));
vi.mock('../bluetooth-status-store', () => ({ registerBluetoothConnection: vi.fn(() => vi.fn()) }));
vi.mock('@/app/lib/ble/capacitor-utils', () => ({
  isCapacitor: vi.fn(() => false),
  isCapacitorWebView: vi.fn(() => false),
  isNativeApp: vi.fn(() => false),
  waitForCapacitor: vi.fn().mockResolvedValue(false),
  CAPACITOR_BRIDGE_TIMEOUT_MS: 2000,
}));
vi.mock('@/app/lib/led-color-overrides-db', () => ({ useLedColorOverrides: () => [{}, vi.fn()] }));

// frame helpers used by the AutoSender — return the frame verbatim.
vi.mock('@boardsesh/board-constants/hold-states', () => ({
  accumulateFramesToMaps: () => ({}),
  accumulatedMapsToFrameStrings: () => ['p1r1'],
}));

const mockShowMessage = vi.fn();
vi.mock('../../providers/snackbar-provider', () => ({ useSnackbar: () => ({ showMessage: mockShowMessage }) }));

const mockConfirmClimbOnWall = vi.fn().mockResolvedValue(undefined);
vi.mock('@/app/components/persistent-session', () => ({
  usePersistentSessionActions: () => ({
    confirmClimbOnWall: mockConfirmClimbOnWall,
    setSessionBoardSerial: vi.fn().mockResolvedValue(undefined),
  }),
  usePersistentSessionState: () => ({ session: null }),
}));

const queue = vi.hoisted(() => ({ current: null as ClimbQueueItem | null }));
vi.mock('../../graphql-queue', () => ({
  useCurrentClimb: () => ({ currentClimbQueueItem: queue.current, currentClimb: queue.current?.climb ?? null }),
}));

vi.mock('@boardsesh/play-view', () => ({ emitWallConfirm: vi.fn() }));

// The presence controls + wall report — the surface under test.
const presence = vi.hoisted(() => ({
  enabled: false as boolean,
  boardId: null as number | null,
  resolveAndBindBoard: vi.fn().mockResolvedValue(null),
  reportClimb: vi.fn().mockResolvedValue(true),
  undo: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../board-presence/board-presence-context', () => ({
  useBoardPresenceControls: () => ({
    enabled: presence.enabled,
    boardId: presence.boardId,
    resolveAndBindBoard: presence.resolveAndBindBoard,
  }),
  useOptionalWallReport: () => ({ reportClimb: presence.reportClimb, undo: presence.undo }),
}));

import { BluetoothProvider } from '../bluetooth-context';

function makeBoardDetails(): BoardDetails {
  return {
    board_name: 'kilter',
    layout_id: 1,
    size_id: 10,
    set_ids: [1, 2],
    images_to_holds: {},
    holdsData: {},
    edge_left: 0,
    edge_right: 100,
    edge_bottom: 0,
    edge_top: 100,
    boardHeight: 100,
    boardWidth: 100,
    layout_name: 'Original',
  } as unknown as BoardDetails;
}

function makeItem(uuid: string): ClimbQueueItem {
  return {
    uuid: `q-${uuid}`,
    climb: {
      uuid,
      name: `Climb ${uuid}`,
      frames: 'p1r1',
      angle: 45,
      mirrored: false,
      setter_username: 's',
      description: '',
      ascensionist_count: 0,
      difficulty: 'V5',
      quality_average: '4',
      stars: 4,
      difficulty_error: '',
    },
    addedBy: 'me',
  } as unknown as ClimbQueueItem;
}

describe('Bluetooth board-presence: connect → resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ble.isConnected = false;
    queue.current = null;
    presence.enabled = false;
    presence.boardId = null;
    presence.resolveAndBindBoard.mockResolvedValue(null);
    lastConnectSuccess = null;
  });

  it('does NOT resolve the board on connect when the flag is off', () => {
    render(
      <BluetoothProvider boardDetails={makeBoardDetails()}>
        <div />
      </BluetoothProvider>,
    );
    lastConnectSuccess?.('SERIAL-123');
    expect(presence.resolveAndBindBoard).not.toHaveBeenCalled();
  });

  it('resolves + binds the board on connect when the flag is on, with the route board config', () => {
    presence.enabled = true;
    render(
      <BluetoothProvider boardDetails={makeBoardDetails()}>
        <div />
      </BluetoothProvider>,
    );
    lastConnectSuccess?.('SERIAL-123');
    expect(presence.resolveAndBindBoard).toHaveBeenCalledWith({
      serial: 'SERIAL-123',
      boardType: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: '1,2',
    });
  });
});

describe('Bluetooth board-presence: wall-confirm → report + Undo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queue.current = makeItem('c1');
    ble.isConnected = true;
    mockSendFrames.mockResolvedValue(true);
    presence.enabled = true;
    presence.boardId = 77;
    presence.reportClimb.mockResolvedValue(true);
    presence.undo.mockResolvedValue(true);
  });

  it('reports the lit climb to the wall feed and shows an Undo snackbar', async () => {
    render(
      <BluetoothProvider boardDetails={makeBoardDetails()}>
        <div />
      </BluetoothProvider>,
    );

    // The AutoSender (mounted because isConnected) sends the current climb and
    // calls onWallConfirmed, which reports to the wall feed for a bound board.
    await waitFor(() => {
      expect(presence.reportClimb).toHaveBeenCalledTimes(1);
    });
    const [climbInput, angle] = presence.reportClimb.mock.calls[0];
    expect(climbInput.uuid).toBe('q-c1');
    expect(climbInput.climb.uuid).toBe('c1');
    expect(angle).toBe(45);

    // The accidental-takeover Undo snackbar fires after the report is accepted.
    await waitFor(() => {
      expect(mockShowMessage).toHaveBeenCalledTimes(1);
    });
    const [text, severity, action, duration] = mockShowMessage.mock.calls[0];
    expect(text).toBe(tFromCatalog('session', 'boardPresence.wallChanged'));
    expect(severity).toBe('info');
    expect(action.label).toBe(tFromCatalog('session', 'boardPresence.undo'));
    expect(duration).toBe(8000);

    // The Undo action re-lights the previous climb via the wall context's undo.
    action.onClick();
    expect(presence.undo).toHaveBeenCalledTimes(1);
  });

  it('does NOT report when the board-presence flag is off', async () => {
    presence.enabled = false;
    render(
      <BluetoothProvider boardDetails={makeBoardDetails()}>
        <div />
      </BluetoothProvider>,
    );
    await waitFor(() => {
      expect(mockSendFrames).toHaveBeenCalled();
    });
    expect(presence.reportClimb).not.toHaveBeenCalled();
    expect(mockShowMessage).not.toHaveBeenCalled();
  });

  it('does NOT report when no board is bound (boardId null)', async () => {
    presence.boardId = null;
    render(
      <BluetoothProvider boardDetails={makeBoardDetails()}>
        <div />
      </BluetoothProvider>,
    );
    await waitFor(() => {
      expect(mockSendFrames).toHaveBeenCalled();
    });
    expect(presence.reportClimb).not.toHaveBeenCalled();
  });
});
