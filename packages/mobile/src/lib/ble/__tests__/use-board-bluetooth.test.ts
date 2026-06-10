// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Alert } from 'react-native';
import type { HoldPlacement } from '../../../components/board-renderer/types';
import {
  reactNativePermissionHarness,
  resetReactNativePermissionHarness,
} from './react-native-permissions-test-harness';

// ── Mock native modules that use-board-bluetooth.ts imports transitively ──

const mockBleManager = vi.hoisted(() => ({
  state: vi.fn().mockResolvedValue('PoweredOn'),
  onStateChange: vi.fn(),
}));

vi.mock('react-native', async () => {
  const { reactNativePermissionHarness: harness } = await import('./react-native-permissions-test-harness');
  return {
    Alert: { alert: vi.fn() },
    Platform: harness.platform,
    PermissionsAndroid: harness.permissionsAndroid,
  };
});

vi.mock('react-native-ble-plx', () => ({
  State: {
    PoweredOn: 'PoweredOn',
    PoweredOff: 'PoweredOff',
    Unknown: 'Unknown',
  },
}));

vi.mock('../ble-manager', () => ({
  bleManager: mockBleManager,
}));

vi.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: vi.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: vi.fn().mockResolvedValue(undefined),
}));

const mockParseApiLevel = vi.hoisted(() => vi.fn());
const mockParseSerialNumber = vi.hoisted(() => vi.fn());
vi.mock('@boardsesh/ble-protocol/aurora', () => ({
  getAuroraBluetoothPacket: vi.fn(),
  parseApiLevel: mockParseApiLevel,
  parseSerialNumber: mockParseSerialNumber,
}));

const mockTrack = vi.hoisted(() => vi.fn());
vi.mock('../../analytics', () => ({
  track: mockTrack,
}));

const mockGetMoonboardBluetoothPacket = vi.hoisted(() => vi.fn());
vi.mock('@boardsesh/ble-protocol/moonboard', () => ({
  getMoonboardBluetoothPacket: mockGetMoonboardBluetoothPacket,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// The serial-recording path imports the GraphQL HTTP client, which transitively
// pulls in expo-secure-store (via the auth interceptor) — unavailable in the
// test environment. Short-circuit it; these tests only exercise the pure helpers.
vi.mock('../../graphql/client', () => ({
  getHttpClient: vi.fn(() => ({ request: vi.fn().mockResolvedValue({ recordBoardSerial: null }) })),
}));

// The serial-recording path also reads the stored auth token to skip the
// mutation when signed out. auth-store imports expo-secure-store directly, which
// is unavailable in the test environment — stub it with a present token.
vi.mock('../../auth-store', () => ({
  getAuthToken: vi.fn().mockResolvedValue('test-token'),
}));

vi.mock('../adapter', () => ({
  RNBleAdapter: vi.fn(),
}));

// adapter-factory pulls in modules/live-activity/src/index, which pulls in
// expo-modules-core, which references the React Native `__DEV__` global at
// import time. Short-circuiting the factory here avoids that chain — the
// tests below only exercise the pure helpers `convertToMirroredFramesString`
// and `dispatchMoonboardPacket`.
vi.mock('../adapter-factory', () => ({
  createBluetoothAdapter: vi.fn(),
  isNativeIosBleAdapter: vi.fn().mockReturnValue(false),
}));

import { createBluetoothAdapter } from '../adapter-factory';
import {
  convertToMirroredFramesString,
  dispatchMoonboardPacket,
  mergeAbortSignals,
  useBoardBluetooth,
} from '../use-board-bluetooth';

// ── Factory helper ─────────────────────────────────────────────────────────

function makePlacement(id: number, mirroredHoldId: number | null): HoldPlacement {
  return { id, mirroredHoldId, cx: 0, cy: 0, r: 10 };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('useBoardBluetooth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetReactNativePermissionHarness();
    mockBleManager.state.mockResolvedValue('PoweredOn');
  });

  it('shows permission copy and stops before adapter availability when Android BLE permission is denied', async () => {
    reactNativePermissionHarness.permissionsAndroid.requestMultiple.mockResolvedValue({
      BLUETOOTH_SCAN: 'denied',
      BLUETOOTH_CONNECT: 'granted',
    });
    const { result } = renderHook(() =>
      useBoardBluetooth({
        boardName: 'kilter',
        layoutId: 1,
        sizeId: 1,
      }),
    );

    let connected = true;
    await act(async () => {
      connected = await result.current.connect();
    });

    expect(connected).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('ble.permissionRequired', 'ble.errorPermissionDenied');
    expect(createBluetoothAdapter).not.toHaveBeenCalled();
  });

  it('emits apiLevel and deviceNamePresent on the connection-success event', async () => {
    reactNativePermissionHarness.permissionsAndroid.requestMultiple.mockResolvedValue({
      BLUETOOTH_SCAN: 'granted',
      BLUETOOTH_CONNECT: 'granted',
    });
    const fakeAdapter = {
      isAvailable: vi.fn().mockResolvedValue(true),
      requestAndConnect: vi.fn().mockResolvedValue({ deviceId: 'dev-1', deviceName: 'Kilter A1#0042@3' }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
      onDisconnect: vi.fn().mockReturnValue(() => {}),
    };
    vi.mocked(createBluetoothAdapter).mockReturnValue(fakeAdapter);
    mockParseApiLevel.mockReturnValue(3);
    mockParseSerialNumber.mockReturnValue('0042');

    const { result } = renderHook(() =>
      useBoardBluetooth({
        boardName: 'kilter',
        layoutId: 1,
        sizeId: 1,
        setIds: '1',
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    const successCall = mockTrack.mock.calls.find(([name]) => name === 'Bluetooth Connection Success');
    expect(successCall).toBeDefined();
    expect(successCall?.[1]).toMatchObject({ apiLevel: 3, deviceNamePresent: true });
  });

  it('reports deviceNamePresent=false and the v2 fallback level when no name is advertised', async () => {
    reactNativePermissionHarness.permissionsAndroid.requestMultiple.mockResolvedValue({
      BLUETOOTH_SCAN: 'granted',
      BLUETOOTH_CONNECT: 'granted',
    });
    const fakeAdapter = {
      isAvailable: vi.fn().mockResolvedValue(true),
      requestAndConnect: vi.fn().mockResolvedValue({ deviceId: 'dev-2', deviceName: undefined }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
      onDisconnect: vi.fn().mockReturnValue(() => {}),
    };
    vi.mocked(createBluetoothAdapter).mockReturnValue(fakeAdapter);
    // Mirrors parseApiLevel's real default for a missing/unparseable name.
    mockParseApiLevel.mockReturnValue(2);
    mockParseSerialNumber.mockReturnValue(undefined);

    const { result } = renderHook(() =>
      useBoardBluetooth({
        boardName: 'kilter',
        layoutId: 1,
        sizeId: 1,
        setIds: '1',
      }),
    );

    await act(async () => {
      await result.current.connect();
    });

    const successCall = mockTrack.mock.calls.find(([name]) => name === 'Bluetooth Connection Success');
    expect(successCall).toBeDefined();
    expect(successCall?.[1]).toMatchObject({ apiLevel: 2, deviceNamePresent: false });
  });
});

describe('convertToMirroredFramesString', () => {
  it('correctly maps hold IDs to mirrored IDs', () => {
    const holdsData: HoldPlacement[] = [makePlacement(100, 200), makePlacement(101, 201)];

    const frames = 'p100r12p101r14';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('p200r12p201r14');
  });

  it('handles a single hold', () => {
    const holdsData: HoldPlacement[] = [makePlacement(42, 84)];

    const frames = 'p42r5';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('p84r5');
  });

  it('handles multiple holds with different state codes', () => {
    const holdsData: HoldPlacement[] = [makePlacement(1, 10), makePlacement(2, 20), makePlacement(3, 30)];

    const frames = 'p1r1p2r2p3r3';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('p10r1p20r2p30r3');
  });

  it('handles empty frames string', () => {
    const holdsData: HoldPlacement[] = [makePlacement(1, 10)];

    const frames = '';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('');
  });

  it('throws when mirroredHoldId is undefined for a hold', () => {
    // Hold 42 has no mirrored ID (null)
    const holdsData: HoldPlacement[] = [makePlacement(42, null)];

    const frames = 'p42r5';

    expect(() => convertToMirroredFramesString(frames, holdsData)).toThrow(
      'Mirrored hold ID is not defined for hold ID 42.',
    );
  });

  it('throws when hold ID is not present in holdsData at all', () => {
    // holdsData is empty — no mapping exists for hold 99
    const holdsData: HoldPlacement[] = [];

    const frames = 'p99r7';

    expect(() => convertToMirroredFramesString(frames, holdsData)).toThrow(
      'Mirrored hold ID is not defined for hold ID 99.',
    );
  });

  it('preserves state codes exactly', () => {
    const holdsData: HoldPlacement[] = [makePlacement(500, 600)];

    const frames = 'p500r255';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('p600r255');
  });

  it('uses only holds with mirroredHoldId set in the map', () => {
    // Two holds: one with mirror, one without. Only the one with mirror is in frames.
    const holdsData: HoldPlacement[] = [
      makePlacement(10, 20),
      makePlacement(30, null), // no mirror
    ];

    // Only hold 10 is in frames, which has a valid mirror
    const frames = 'p10r1';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('p20r1');
  });
});

// ── dispatchMoonboardPacket ─────────────────────────────────────────────────

describe('dispatchMoonboardPacket', () => {
  beforeEach(() => {
    mockGetMoonboardBluetoothPacket.mockReset();
  });

  it('calls write() with the packet bytes, not the full packet object', async () => {
    const fakePacket = new Uint8Array([0x01, 0x02, 0x03]);
    mockGetMoonboardBluetoothPacket.mockReturnValue({
      packet: fakePacket,
      totalPlacements: 2,
      skippedRoleCount: 0,
      skippedPositionCount: 0,
    });
    const write = vi.fn().mockResolvedValue(undefined);

    await dispatchMoonboardPacket('p1r12p2r14', write);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(fakePacket, undefined);
    // Confirm the full object was NOT passed (catches the `.packet` omission regression)
    expect(write).not.toHaveBeenCalledWith({ packet: fakePacket }, undefined);
  });

  it('returns true on success', async () => {
    mockGetMoonboardBluetoothPacket.mockReturnValue({
      packet: new Uint8Array([0x00]),
      totalPlacements: 1,
      skippedRoleCount: 0,
      skippedPositionCount: 0,
    });
    const write = vi.fn().mockResolvedValue(undefined);

    const result = await dispatchMoonboardPacket('p1r12', write);

    expect(result).toBe(true);
  });

  it('returns undefined and skips write when frames is empty', async () => {
    const write = vi.fn();

    const result = await dispatchMoonboardPacket('', write);

    expect(result).toBeUndefined();
    expect(write).not.toHaveBeenCalled();
  });

  it('forwards the AbortSignal to write()', async () => {
    const fakePacket = new Uint8Array([0xaa]);
    mockGetMoonboardBluetoothPacket.mockReturnValue({
      packet: fakePacket,
      totalPlacements: 1,
      skippedRoleCount: 0,
      skippedPositionCount: 0,
    });
    const write = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();

    await dispatchMoonboardPacket('p5r3', write, controller.signal);

    expect(write).toHaveBeenCalledWith(fakePacket, controller.signal);
  });

  it('returns false and never writes when every placement is skipped (board would go dark)', async () => {
    // getMoonboardBluetoothPacket emits the "clear all" packet `l##` with
    // skippedRoleCount === totalPlacements when no hold maps to a known role.
    // Writing that would silently dark the board while reporting success.
    mockGetMoonboardBluetoothPacket.mockReturnValue({
      packet: new TextEncoder().encode('l##'),
      totalPlacements: 2,
      skippedRoleCount: 2,
      skippedPositionCount: 0,
    });
    const write = vi.fn().mockResolvedValue(undefined);

    const result = await dispatchMoonboardPacket('p1r99p2r98', write);

    expect(result).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('writes and returns true when only some placements are skipped', async () => {
    const fakePacket = new TextEncoder().encode('l#S0#');
    mockGetMoonboardBluetoothPacket.mockReturnValue({
      packet: fakePacket,
      totalPlacements: 2,
      skippedRoleCount: 1,
      skippedPositionCount: 0,
    });
    const write = vi.fn().mockResolvedValue(undefined);

    const result = await dispatchMoonboardPacket('p1r42p2r99', write);

    expect(result).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });
});

// ── mergeAbortSignals ───────────────────────────────────────────────────────

describe('mergeAbortSignals', () => {
  it('removes the abort listener from the long-lived signal once disposed (no leak per write)', () => {
    // The AutoSender passes one lifetime-scoped signal to every send. Each send
    // creates a fresh per-write controller and merges. Without dispose, every
    // successful (non-aborted) write parked a permanent listener on the
    // lifetime signal, leaking the per-write controller for the connection.
    const lifetime = new AbortController();
    const addSpy = vi.spyOn(lifetime.signal, 'addEventListener');
    const removeSpy = vi.spyOn(lifetime.signal, 'removeEventListener');

    // Simulate N consecutive successful sends: merge, then dispose without aborting.
    for (let send = 0; send < 5; send++) {
      const perWrite = new AbortController();
      const { dispose } = mergeAbortSignals(lifetime.signal, perWrite.signal);
      dispose();
    }

    // Every listener added to the lifetime signal must have been removed again.
    const abortListenersAdded = addSpy.mock.calls.filter(([eventName]) => eventName === 'abort').length;
    const abortListenersRemoved = removeSpy.mock.calls.filter(([eventName]) => eventName === 'abort').length;
    expect(abortListenersAdded).toBe(5);
    expect(abortListenersRemoved).toBe(5);
  });

  it('still aborts the merged signal when an input signal aborts', () => {
    const lifetime = new AbortController();
    const perWrite = new AbortController();
    const { signal } = mergeAbortSignals(lifetime.signal, perWrite.signal);

    expect(signal.aborted).toBe(false);
    perWrite.abort();
    expect(signal.aborted).toBe(true);
  });

  it('returns an already-aborted signal when an input is already aborted', () => {
    const lifetime = new AbortController();
    lifetime.abort();
    const perWrite = new AbortController();

    const { signal, dispose } = mergeAbortSignals(lifetime.signal, perWrite.signal);

    expect(signal.aborted).toBe(true);
    // dispose must be safe to call even on the early-aborted path.
    expect(() => dispose()).not.toThrow();
  });
});
