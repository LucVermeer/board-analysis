import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the ble-protocol exports — the adapter only uses the UUID constants
// and parseSerialNumber for auto-select matching.
vi.mock('@boardsesh/ble-protocol', () => ({
  AURORA_ADVERTISED_SERVICE_UUID: 'AURORA-UUID',
  UART_SERVICE_UUID: 'UART-UUID',
  parseSerialNumber: (name?: string) => name ?? null,
}));

// Mock the Expo native module the adapter delegates to. vi.hoisted runs
// before the vi.mock factory so the shared state is initialized in time.
type ScanListener = (payload: { device: { deviceId: string; name: string }; localName: string; rssi: number }) => void;
type DisconnectListener = (payload: { deviceId: string }) => void;
const harness = vi.hoisted(() => {
  const scanListeners: ScanListener[] = [];
  const disconnectListeners: DisconnectListener[] = [];
  return {
    scanListeners,
    disconnectListeners,
    nativeMock: {
      isAvailable: vi.fn().mockResolvedValue({ available: true }),
      startScan: vi.fn().mockResolvedValue(undefined),
      stopScan: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
      cancelWrites: vi.fn().mockResolvedValue(undefined),
      configureBoard: vi.fn().mockResolvedValue(undefined),
      addListener: vi.fn((event: string, listener: ScanListener | DisconnectListener) => {
        if (event === 'scanResult') {
          scanListeners.push(listener as ScanListener);
          return {
            remove: () => scanListeners.splice(scanListeners.indexOf(listener as ScanListener), 1),
          };
        }
        if (event === 'disconnected') {
          disconnectListeners.push(listener as DisconnectListener);
          return {
            remove: () => disconnectListeners.splice(disconnectListeners.indexOf(listener as DisconnectListener), 1),
          };
        }
        return { remove: () => {} };
      }),
    },
  };
});
const { scanListeners, disconnectListeners, nativeMock } = harness;

vi.mock('../../../../modules/live-activity/src/index', () => ({
  boardBleNative: harness.nativeMock,
}));

import { NativeIosBleAdapter } from '../native-ios-adapter';
import { SERIAL_RECONNECT_GRACE_MS } from '@boardsesh/ble-protocol/scan-constants';

beforeEach(() => {
  vi.useFakeTimers();
  Object.values(nativeMock).forEach((fn) => {
    if ('mockClear' in fn) fn.mockClear();
  });
  scanListeners.length = 0;
  disconnectListeners.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NativeIosBleAdapter scan timeout', () => {
  it('rejects the picker promise when no devices are discovered within 30s', async () => {
    // Picker callback that subscribes but never resolves — simulates a user
    // staring at an empty picker.
    const adapter = new NativeIosBleAdapter(() => new Promise(() => {}));
    const connectPromise = adapter.requestAndConnect().catch((error: Error) => error);
    // Let microtasks settle (startScan is async).
    await Promise.resolve();
    await Promise.resolve();

    vi.advanceTimersByTime(30_000);
    // Advance past any chained promise resolutions in the timeout handler.
    await vi.runAllTimersAsync();

    const result = await connectPromise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/no boards found/i);
    expect(nativeMock.stopScan).toHaveBeenCalled();
  });

  it("does NOT reject the picker when devices have been discovered (user just hasn't picked yet)", async () => {
    // Returns a promise that resolves only when we call manualPick later —
    // mirrors the user tapping a device in the picker UI after scan times out.
    let manualPick: (deviceId: string) => void = () => {};
    const adapter = new NativeIosBleAdapter(
      () =>
        new Promise<string>((resolve) => {
          manualPick = resolve;
        }),
    );
    const connectPromise = adapter.requestAndConnect();
    await Promise.resolve();

    // Emit a scan result before the timeout fires.
    scanListeners[0]?.({
      device: { deviceId: 'dev-1', name: 'Kilter A1B2C3' },
      localName: 'Kilter A1B2C3',
      rssi: -60,
    });

    vi.advanceTimersByTime(30_000);
    await vi.runAllTimersAsync();

    // Picker promise must still be live — user can still pick the device
    // that was discovered before the timeout.
    manualPick('dev-1');
    await connectPromise;

    expect(nativeMock.connect).toHaveBeenCalledWith('dev-1');
  });

  it('falls back to the picker (not a hard reject) when targetSerial never advertises', async () => {
    let pickerOpened = false;
    // Picker that stays open once shown (never resolves on its own).
    const adapter = new NativeIosBleAdapter(() => {
      pickerOpened = true;
      return new Promise<string>(() => {});
    });
    const connectPromise = adapter.requestAndConnect('NEEDLE-SERIAL').catch((error: Error) => error);
    await Promise.resolve();

    // Before the grace window the auto-select is still silent — no picker.
    vi.advanceTimersByTime(SERIAL_RECONNECT_GRACE_MS - 1);
    await Promise.resolve();
    expect(pickerOpened).toBe(false);

    // Grace window elapses with no serial match → the picker opens instead of
    // waiting out the full scan window and failing.
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(pickerOpened).toBe(true);

    // ...and with nothing ever discovered, the scan timeout rejects so the
    // sheet doesn't spin forever.
    vi.advanceTimersByTime(30_000);
    await vi.runAllTimersAsync();
    const result = await connectPromise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/no boards found/i);
  });

  it('lets the user pick the stored board after the grace window opens the picker', async () => {
    let manualPick: (deviceId: string) => void = () => {};
    const adapter = new NativeIosBleAdapter(
      () =>
        new Promise<string>((resolve) => {
          manualPick = resolve;
        }),
    );
    const connectPromise = adapter.requestAndConnect('NEEDLE-SERIAL');
    await Promise.resolve();

    // Grace window opens the picker.
    vi.advanceTimersByTime(SERIAL_RECONNECT_GRACE_MS);
    await Promise.resolve();

    // The board finally advertises after the picker opened — it shows up as a
    // pickable device (auto-select has stopped), and the user taps it.
    scanListeners[0]?.({
      device: { deviceId: 'late-dev', name: 'NEEDLE-SERIAL' },
      localName: 'NEEDLE-SERIAL',
      rssi: -50,
    });
    manualPick('late-dev');
    await vi.runAllTimersAsync();
    await connectPromise;

    expect(nativeMock.connect).toHaveBeenCalledWith('late-dev');
  });
});

describe('NativeIosBleAdapter connect flow', () => {
  it('auto-selects a discovered device matching targetSerial', async () => {
    const adapter = new NativeIosBleAdapter(() => Promise.reject(new Error('picker should not open')));
    const connectPromise = adapter.requestAndConnect('Kilter A1B2C3');
    await Promise.resolve();

    scanListeners[0]?.({
      device: { deviceId: 'dev-9', name: 'Kilter A1B2C3' },
      localName: 'Kilter A1B2C3',
      rssi: -55,
    });
    await vi.runAllTimersAsync();
    await connectPromise;

    expect(nativeMock.connect).toHaveBeenCalledWith('dev-9');
    expect(nativeMock.startScan).toHaveBeenCalledWith(['AURORA-UUID', 'UART-UUID']);
  });
});
