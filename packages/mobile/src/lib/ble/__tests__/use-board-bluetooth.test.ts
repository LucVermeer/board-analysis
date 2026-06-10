// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
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

const mockGetAuroraBluetoothPacket = vi.hoisted(() => vi.fn());
vi.mock('@boardsesh/ble-protocol/aurora', () => ({
  getAuroraBluetoothPacket: mockGetAuroraBluetoothPacket,
  parseApiLevel: vi.fn(),
  parseBoardTypeFromDeviceName: vi.fn(),
  parseSerialNumber: vi.fn(),
}));

const mockGetLedPlacements = vi.hoisted(() => vi.fn());
vi.mock('@boardsesh/board-constants/led-placements', () => ({
  getLedPlacements: mockGetLedPlacements,
}));

const mockGetMoonboardBluetoothPacket = vi.hoisted(() => vi.fn());
vi.mock('@boardsesh/ble-protocol/moonboard', () => ({
  getMoonboardBluetoothPacket: mockGetMoonboardBluetoothPacket,
  isMoonboardDeviceName: vi.fn((name?: string) => !!name && name.startsWith('MoonBoard')),
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
  // Adoption seam: null/absent = platform without native connection adoption.
  subscribeNativeBleConnected: vi.fn(() => null),
  getNativeBleConnectedDevice: vi.fn(async () => null),
}));

import {
  createBluetoothAdapter,
  getNativeBleConnectedDevice,
  isNativeIosBleAdapter,
  subscribeNativeBleConnected,
} from '../adapter-factory';
import { parseBoardTypeFromDeviceName, parseSerialNumber } from '@boardsesh/ble-protocol/aurora';
import { convertToMirroredFramesString, dispatchMoonboardPacket, useBoardBluetooth } from '../use-board-bluetooth';

// ── Factory helpers ────────────────────────────────────────────────────────

function makePlacement(id: number, mirroredHoldId: number | null): HoldPlacement {
  return { id, mirroredHoldId, cx: 0, cy: 0, r: 10 };
}

type FakeAdapterOverrides = Partial<Record<'isAvailable' | 'requestAndConnect' | 'disconnect' | 'write', unknown>>;

function makeFakeAdapter(overrides: FakeAdapterOverrides = {}) {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    requestAndConnect: vi.fn().mockResolvedValue({ deviceId: 'device-1', deviceName: 'Kilter Board#123@3' }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    onDisconnect: vi.fn(() => () => {}),
    ...overrides,
  };
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

  it('ignores a second connect while one is already in flight', async () => {
    let resolveRequest!: (connection: { deviceId: string; deviceName?: string }) => void;
    const fakeAdapter = makeFakeAdapter({
      requestAndConnect: vi.fn(
        () =>
          new Promise<{ deviceId: string; deviceName?: string }>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    });
    vi.mocked(createBluetoothAdapter).mockReturnValue(
      fakeAdapter as unknown as ReturnType<typeof createBluetoothAdapter>,
    );

    const { result } = renderHook(() => useBoardBluetooth({ boardName: 'moonboard', layoutId: 1, sizeId: 1 }));

    let firstConnect!: Promise<boolean>;
    let secondConnectResult = true;
    await act(async () => {
      firstConnect = result.current.connect();
      // Let the first attempt get past permissions and adapter creation.
      await Promise.resolve();
      secondConnectResult = await result.current.connect();
    });

    expect(secondConnectResult).toBe(false);
    expect(createBluetoothAdapter).toHaveBeenCalledTimes(1);
    expect(createBluetoothAdapter).toHaveBeenCalledWith(expect.any(Function), 'moonboard');

    await act(async () => {
      resolveRequest({ deviceId: 'device-1', deviceName: 'MoonBoard' });
      await firstConnect;
    });
    expect(result.current.isConnected).toBe(true);
  });

  it('alerts on a "cancelled"-flavoured native failure instead of staying silent', async () => {
    // CoreBluetooth/ble-plx reject with "Operation was cancelled" for real
    // failures. The old bare /cancel/i regex treated this as a user cancel and
    // showed nothing — the headline "tapped connect and nothing happened" bug.
    const fakeAdapter = makeFakeAdapter({
      requestAndConnect: vi.fn().mockRejectedValue(new Error('Operation was cancelled')),
    });
    vi.mocked(createBluetoothAdapter).mockReturnValue(
      fakeAdapter as unknown as ReturnType<typeof createBluetoothAdapter>,
    );

    const { result } = renderHook(() => useBoardBluetooth({ boardName: 'kilter', layoutId: 1, sizeId: 1 }));

    await act(async () => {
      await result.current.connect();
    });

    expect(createBluetoothAdapter).toHaveBeenCalledWith(expect.any(Function), 'aurora');
    expect(Alert.alert).toHaveBeenCalledWith('ble.connectionFailedTitle', 'bluetooth.unknownError');
  });

  it('stays silent when the user dismisses the device picker', async () => {
    const fakeAdapter = makeFakeAdapter({
      requestAndConnect: vi.fn().mockRejectedValue(new Error('Device selection cancelled')),
    });
    vi.mocked(createBluetoothAdapter).mockReturnValue(
      fakeAdapter as unknown as ReturnType<typeof createBluetoothAdapter>,
    );

    const { result } = renderHook(() => useBoardBluetooth({ boardName: 'kilter', layoutId: 1, sizeId: 1 }));

    await act(async () => {
      await result.current.connect();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('maps a connect timeout to the connect-failed copy', async () => {
    const fakeAdapter = makeFakeAdapter({
      requestAndConnect: vi.fn().mockRejectedValue(new Error('Connection timed out — board may be powered off')),
    });
    vi.mocked(createBluetoothAdapter).mockReturnValue(
      fakeAdapter as unknown as ReturnType<typeof createBluetoothAdapter>,
    );

    const { result } = renderHook(() => useBoardBluetooth({ boardName: 'kilter', layoutId: 1, sizeId: 1 }));

    await act(async () => {
      await result.current.connect();
    });

    expect(Alert.alert).toHaveBeenCalledWith('ble.connectionFailedTitle', 'bluetooth.connectFailed');
  });

  it('serialises overlapping sendFramesToBoard calls so chunks never interleave', async () => {
    const writeEvents: string[] = [];
    let releaseFirstWrite!: () => void;
    const write = vi.fn((packet: Uint8Array) => {
      const label = String(packet[0]);
      writeEvents.push(`start-${label}`);
      if (writeEvents.length === 1) {
        return new Promise<void>((resolve) => {
          releaseFirstWrite = () => {
            writeEvents.push(`end-${label}`);
            resolve();
          };
        });
      }
      writeEvents.push(`end-${label}`);
      return Promise.resolve();
    });
    const fakeAdapter = makeFakeAdapter({ write });
    vi.mocked(createBluetoothAdapter).mockReturnValue(
      fakeAdapter as unknown as ReturnType<typeof createBluetoothAdapter>,
    );
    mockGetMoonboardBluetoothPacket
      .mockReturnValueOnce({ packet: new Uint8Array([1]) })
      .mockReturnValueOnce({ packet: new Uint8Array([2]) });

    const { result } = renderHook(() => useBoardBluetooth({ boardName: 'moonboard', layoutId: 1, sizeId: 1 }));

    await act(async () => {
      await result.current.connect();
    });

    let firstSend!: Promise<boolean | undefined>;
    let secondSend!: Promise<boolean | undefined>;
    await act(async () => {
      firstSend = result.current.sendFramesToBoard('p1r12');
      secondSend = result.current.sendFramesToBoard('p2r12');
      // Give the second send every chance to start out of order.
      await Promise.resolve();
      await Promise.resolve();
      expect(writeEvents).toEqual(['start-1']);
      releaseFirstWrite();
      await Promise.all([firstSend, secondSend]);
    });

    expect(writeEvents).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('converts frames through the mirror map when mirrored and holdsData are provided', async () => {
    const fakeAdapter = makeFakeAdapter();
    vi.mocked(createBluetoothAdapter).mockReturnValue(
      fakeAdapter as unknown as ReturnType<typeof createBluetoothAdapter>,
    );
    mockGetLedPlacements.mockReturnValue({ 200: 7 });
    mockGetAuroraBluetoothPacket.mockReturnValue({
      packet: new Uint8Array([9]),
      skippedPositionCount: 0,
      skippedRoleCount: 0,
      totalPlacements: 1,
    });

    const holdsData = [makePlacement(100, 200)];
    const { result } = renderHook(() => useBoardBluetooth({ boardName: 'kilter', layoutId: 1, sizeId: 1, holdsData }));

    await act(async () => {
      await result.current.connect();
    });

    await act(async () => {
      await result.current.sendFramesToBoard('p100r12', true);
    });

    expect(mockGetAuroraBluetoothPacket).toHaveBeenCalledWith('p200r12', { 200: 7 }, 'kilter', undefined, undefined);
    expect(fakeAdapter.write).toHaveBeenCalledWith(new Uint8Array([9]), expect.anything());
  });

  it('aborts queued and in-flight writes on disconnect', async () => {
    const write = vi.fn(
      (_packet: Uint8Array, signal?: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Write aborted', 'AbortError')));
        }),
    );
    const fakeAdapter = makeFakeAdapter({ write });
    vi.mocked(createBluetoothAdapter).mockReturnValue(
      fakeAdapter as unknown as ReturnType<typeof createBluetoothAdapter>,
    );
    mockGetMoonboardBluetoothPacket.mockReturnValue({ packet: new Uint8Array([1]) });

    const { result } = renderHook(() => useBoardBluetooth({ boardName: 'moonboard', layoutId: 1, sizeId: 1 }));

    await act(async () => {
      await result.current.connect();
    });

    let pendingSend!: Promise<boolean | undefined>;
    await act(async () => {
      pendingSend = result.current.sendFramesToBoard('p1r12');
      await Promise.resolve();
      await result.current.disconnect();
    });

    // The aborted write resolves as a cancellation (undefined), not a failure.
    await expect(pendingSend).resolves.toBeUndefined();
    expect(fakeAdapter.disconnect).toHaveBeenCalled();
  });
});

// ── Native connection adoption (iOS) ───────────────────────────────────────

describe('useBoardBluetooth native connection adoption', () => {
  type ConnectedListener = (payload: { deviceId: string; deviceName?: string }) => void;
  let connectedListener: ConnectedListener | null = null;

  function makeAdoptableAdapter() {
    return {
      ...makeFakeAdapter(),
      adoptConnection: vi.fn(),
      configureBoard: vi.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetReactNativePermissionHarness();
    connectedListener = null;
    vi.mocked(subscribeNativeBleConnected).mockImplementation((listener) => {
      connectedListener = listener;
      return { remove: vi.fn() };
    });
    vi.mocked(isNativeIosBleAdapter).mockReturnValue(true);
    vi.mocked(parseBoardTypeFromDeviceName).mockImplementation((name?: string) =>
      name?.toLowerCase().startsWith('kilter') ? 'kilter' : undefined,
    );
    vi.mocked(parseSerialNumber).mockImplementation((name?: string) => name?.match(/#([^@]+)/)?.[1]);
  });

  afterEach(() => {
    vi.mocked(subscribeNativeBleConnected).mockImplementation(() => null);
    vi.mocked(getNativeBleConnectedDevice).mockImplementation(async () => null);
    vi.mocked(isNativeIosBleAdapter).mockReturnValue(false);
    vi.mocked(parseBoardTypeFromDeviceName).mockReset();
    vi.mocked(parseSerialNumber).mockReset();
  });

  it('adopts a natively-connected board matching the active config', async () => {
    const adapter = makeAdoptableAdapter();
    vi.mocked(createBluetoothAdapter).mockReturnValue(adapter as unknown as ReturnType<typeof createBluetoothAdapter>);

    const { result } = renderHook(() => useBoardBluetooth({ boardName: 'kilter', layoutId: 1, sizeId: 1 }));

    await act(async () => {
      connectedListener?.({ deviceId: 'native-dev', deviceName: 'Kilter Board#9@3' });
    });

    expect(adapter.adoptConnection).toHaveBeenCalledWith('native-dev');
    expect(result.current.isConnected).toBe(true);
  });

  it('refuses to adopt a device it cannot positively identify as the active board type', async () => {
    const adapter = makeAdoptableAdapter();
    vi.mocked(createBluetoothAdapter).mockReturnValue(adapter as unknown as ReturnType<typeof createBluetoothAdapter>);

    const { result } = renderHook(() => useBoardBluetooth({ boardName: 'kilter', layoutId: 1, sizeId: 1 }));

    await act(async () => {
      // Unnamed device ('' from the bridge) — could be anything, e.g. a
      // MoonBoard that would receive Aurora-format packets.
      connectedListener?.({ deviceId: 'mystery-dev', deviceName: '' });
      // Recognisable, but the wrong family for the active config.
      connectedListener?.({ deviceId: 'moon-dev', deviceName: 'MoonBoard A1' });
    });

    expect(adapter.adoptConnection).not.toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
  });

  it('clears stale adapters after native disconnects so later native connections can be adopted', async () => {
    let firstDisconnectCallback: (() => void) | null = null;
    const firstAdapter = {
      ...makeAdoptableAdapter(),
      onDisconnect: vi.fn((callback: () => void) => {
        firstDisconnectCallback = callback;
        return vi.fn();
      }),
    };
    const secondAdapter = makeAdoptableAdapter();
    vi.mocked(createBluetoothAdapter)
      .mockReturnValueOnce(firstAdapter as unknown as ReturnType<typeof createBluetoothAdapter>)
      .mockReturnValueOnce(secondAdapter as unknown as ReturnType<typeof createBluetoothAdapter>);

    const { result } = renderHook(() => useBoardBluetooth({ boardName: 'kilter', layoutId: 1, sizeId: 1 }));

    await act(async () => {
      connectedListener?.({ deviceId: 'native-dev-1', deviceName: 'Kilter Board#9@3' });
    });
    expect(result.current.isConnected).toBe(true);

    await act(async () => {
      firstDisconnectCallback?.();
    });
    expect(result.current.isConnected).toBe(false);

    await act(async () => {
      connectedListener?.({ deviceId: 'native-dev-2', deviceName: 'Kilter Board#9@3' });
    });

    expect(secondAdapter.adoptConnection).toHaveBeenCalledWith('native-dev-2');
    expect(result.current.isConnected).toBe(true);
  });

  it('adopts a nameless native reconnect when it matches the remembered current-board config', async () => {
    let firstDisconnectCallback: (() => void) | null = null;
    const firstAdapter = {
      ...makeAdoptableAdapter(),
      onDisconnect: vi.fn((callback: () => void) => {
        firstDisconnectCallback = callback;
        return vi.fn();
      }),
    };
    const secondAdapter = makeAdoptableAdapter();
    const onConnectSuccess = vi.fn();
    vi.mocked(createBluetoothAdapter)
      .mockReturnValueOnce(firstAdapter as unknown as ReturnType<typeof createBluetoothAdapter>)
      .mockReturnValueOnce(secondAdapter as unknown as ReturnType<typeof createBluetoothAdapter>);

    const { result } = renderHook(() =>
      useBoardBluetooth({ boardName: 'kilter', layoutId: 1, sizeId: 1, onConnectSuccess }),
    );

    await act(async () => {
      connectedListener?.({ deviceId: 'native-dev-1', deviceName: 'Kilter Board#9@3' });
    });
    await act(async () => {
      firstDisconnectCallback?.();
    });

    await act(async () => {
      connectedListener?.({ deviceId: 'native-dev-2', deviceName: '' });
    });

    expect(secondAdapter.adoptConnection).toHaveBeenCalledWith('native-dev-2');
    expect(result.current.isConnected).toBe(true);
    expect(onConnectSuccess).toHaveBeenLastCalledWith('9');
  });

  it('does not re-adopt after an explicit disconnect until the next deliberate connect', async () => {
    const adapter = makeAdoptableAdapter();
    vi.mocked(createBluetoothAdapter).mockReturnValue(adapter as unknown as ReturnType<typeof createBluetoothAdapter>);

    const { result } = renderHook(() => useBoardBluetooth({ boardName: 'kilter', layoutId: 1, sizeId: 1 }));

    await act(async () => {
      connectedListener?.({ deviceId: 'native-dev', deviceName: 'Kilter Board#9@3' });
    });
    expect(result.current.isConnected).toBe(true);

    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.isConnected).toBe(false);

    // The native disconnect can still be in flight when the app foregrounds —
    // a late connected event (or getConnectedDevice poll) must not resurrect
    // the connection the user just closed.
    await act(async () => {
      connectedListener?.({ deviceId: 'native-dev', deviceName: 'Kilter Board#9@3' });
    });

    expect(adapter.adoptConnection).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBe(false);
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
    mockGetMoonboardBluetoothPacket.mockReturnValue({ packet: fakePacket });
    const write = vi.fn().mockResolvedValue(undefined);

    await dispatchMoonboardPacket('p1r12p2r14', write);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(fakePacket, undefined);
    // Confirm the full object was NOT passed (catches the `.packet` omission regression)
    expect(write).not.toHaveBeenCalledWith({ packet: fakePacket }, undefined);
  });

  it('returns true on success', async () => {
    mockGetMoonboardBluetoothPacket.mockReturnValue({ packet: new Uint8Array([0x00]) });
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
    mockGetMoonboardBluetoothPacket.mockReturnValue({ packet: fakePacket });
    const write = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();

    await dispatchMoonboardPacket('p5r3', write, controller.signal);

    expect(write).toHaveBeenCalledWith(fakePacket, controller.signal);
  });
});
