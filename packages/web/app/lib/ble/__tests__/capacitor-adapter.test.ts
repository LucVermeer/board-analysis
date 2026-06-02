import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vite-plus/test';
import type { DevicePickerFn } from '../types';
import { SERIAL_RECONNECT_GRACE_MS } from '../scan-constants';
import {
  AURORA_OPTIONAL_SERVICE_UUIDS,
  AURORA_SCAN_SERVICE_UUIDS,
} from '@/app/components/board-bluetooth-control/bluetooth-aurora';
import {
  MOONBOARD_OPTIONAL_SERVICE_UUIDS,
  MOONBOARD_SCAN_SERVICE_UUIDS,
} from '@/app/components/board-bluetooth-control/bluetooth-moonboard';
import { CapacitorBleAdapter, _resetInitCache } from '../capacitor-adapter';

// Mock window.Capacitor before importing the adapter
const mockListenerRemove = vi.fn().mockResolvedValue(undefined);
let disconnectListenerCallback: ((data: { deviceId: string }) => void) | null = null;

const mockBlePlugin = {
  initialize: vi.fn().mockResolvedValue(undefined),
  isEnabled: vi.fn().mockResolvedValue({ value: true }),
  requestDevice: vi.fn().mockResolvedValue({ deviceId: 'dev-1', name: 'Kilter Board' }),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  write: vi.fn().mockResolvedValue(undefined),
  requestMtu: vi.fn().mockResolvedValue({ value: 185 }),
  addListener: vi.fn().mockImplementation((_event: string, cb: (data: { deviceId: string }) => void) => {
    disconnectListenerCallback = cb;
    return Promise.resolve({ remove: mockListenerRemove });
  }),
};

// Store original window.Capacitor so we can clean up
const originalCapacitor = window.Capacitor;

Object.defineProperty(window, 'Capacitor', {
  value: {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    Plugins: {
      BluetoothLe: mockBlePlugin,
    },
  },
  writable: true,
  configurable: true,
});

afterAll(() => {
  if (originalCapacitor === undefined) {
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
  } else {
    window.Capacitor = originalCapacitor;
  }
});

describe('CapacitorBleAdapter', () => {
  let adapter: CapacitorBleAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    disconnectListenerCallback = null;
    _resetInitCache();
    adapter = new CapacitorBleAdapter();
  });

  describe('isAvailable', () => {
    it('returns true when BLE is enabled', async () => {
      expect(await adapter.isAvailable()).toBe(true);
      expect(mockBlePlugin.initialize).toHaveBeenCalled();
      expect(mockBlePlugin.isEnabled).toHaveBeenCalled();
    });

    it('returns false when BLE is disabled', async () => {
      mockBlePlugin.isEnabled.mockResolvedValueOnce({ value: false });
      expect(await adapter.isAvailable()).toBe(false);
    });

    it('returns false when initialize throws', async () => {
      mockBlePlugin.initialize.mockRejectedValueOnce(new Error('No BLE'));
      expect(await adapter.isAvailable()).toBe(false);
    });
  });

  describe('requestAndConnect', () => {
    it('connects and returns device info', async () => {
      const connection = await adapter.requestAndConnect();

      expect(connection.deviceId).toBe('dev-1');
      expect(connection.deviceName).toBe('Kilter Board');
      expect(mockBlePlugin.requestDevice).toHaveBeenCalledWith({
        services: [...AURORA_SCAN_SERVICE_UUIDS],
        optionalServices: [...AURORA_OPTIONAL_SERVICE_UUIDS],
      });
      expect(mockBlePlugin.connect).toHaveBeenCalledWith({
        deviceId: 'dev-1',
      });
    });

    it('requests Moonboard devices via Nordic UART when board is Moonboard', async () => {
      const moonboardAdapter = new CapacitorBleAdapter('moonboard');

      await moonboardAdapter.requestAndConnect();

      expect(mockBlePlugin.requestDevice).toHaveBeenCalledWith({
        services: [...MOONBOARD_SCAN_SERVICE_UUIDS],
        optionalServices: [...MOONBOARD_OPTIONAL_SERVICE_UUIDS],
      });
    });

    it('negotiates MTU after connecting', async () => {
      await adapter.requestAndConnect();

      expect(mockBlePlugin.requestMtu).toHaveBeenCalledWith({
        deviceId: 'dev-1',
        mtu: 512,
      });
    });

    it('registers disconnect listener after connecting', async () => {
      await adapter.requestAndConnect();

      expect(mockBlePlugin.addListener).toHaveBeenCalledWith('disconnected', expect.any(Function));
    });

    it('falls back to default MTU when negotiation fails', async () => {
      mockBlePlugin.requestMtu.mockRejectedValueOnce(new Error('Not supported'));
      await adapter.requestAndConnect();

      // Should still connect successfully — write with default 20-byte chunks
      const data = new Uint8Array(40);
      await adapter.write(data);

      // 40 bytes / 20 byte chunks = 2 writes
      expect(mockBlePlugin.write).toHaveBeenCalledTimes(2);
    });
  });

  describe('disconnect', () => {
    it('disconnects from connected device', async () => {
      await adapter.requestAndConnect();
      await adapter.disconnect();

      expect(mockBlePlugin.disconnect).toHaveBeenCalledWith({ deviceId: 'dev-1' });
    });

    it('removes disconnect listener before disconnecting', async () => {
      await adapter.requestAndConnect();
      await adapter.disconnect();

      expect(mockListenerRemove).toHaveBeenCalled();
      // Listener removal should happen before the plugin disconnect call
      const removeOrder = mockListenerRemove.mock.invocationCallOrder[0];
      const disconnectOrder = mockBlePlugin.disconnect.mock.invocationCallOrder[0];
      expect(removeOrder).toBeLessThan(disconnectOrder);
    });

    it('does nothing when not connected', async () => {
      await adapter.disconnect();
      expect(mockBlePlugin.disconnect).not.toHaveBeenCalled();
    });

    it('ignores errors from plugin disconnect', async () => {
      await adapter.requestAndConnect();
      mockBlePlugin.disconnect.mockRejectedValueOnce(new Error('Already disconnected'));

      // Should not throw
      await adapter.disconnect();
    });
  });

  describe('write', () => {
    it('throws when not connected', async () => {
      await expect(adapter.write(new Uint8Array([1, 2, 3]))).rejects.toThrow('Not connected');
    });

    it('writes small data in a single chunk as hex string', async () => {
      mockBlePlugin.requestMtu.mockResolvedValueOnce({ value: 185 });
      await adapter.requestAndConnect();

      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await adapter.write(data);

      expect(mockBlePlugin.write).toHaveBeenCalledTimes(1);
      expect(mockBlePlugin.write).toHaveBeenCalledWith({
        deviceId: 'dev-1',
        service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        characteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
        value: '0102030405',
      });
    });

    it('chunks data based on negotiated MTU', async () => {
      // MTU 185 → chunk size 182 (185 - 3 ATT header)
      mockBlePlugin.requestMtu.mockResolvedValueOnce({ value: 185 });
      await adapter.requestAndConnect();

      // 400 bytes / 182 byte chunks = 3 writes (182 + 182 + 36)
      const data = new Uint8Array(400);
      await adapter.write(data);

      expect(mockBlePlugin.write).toHaveBeenCalledTimes(3);
    });

    it('chunks at default 20 bytes when MTU negotiation fails', async () => {
      mockBlePlugin.requestMtu.mockRejectedValueOnce(new Error('Not supported'));
      await adapter.requestAndConnect();

      // 50 bytes / 20 byte chunks = 3 writes (20 + 20 + 10)
      const data = new Uint8Array(50);
      await adapter.write(data);

      expect(mockBlePlugin.write).toHaveBeenCalledTimes(3);
    });

    it('encodes bytes as continuous hex string', async () => {
      await adapter.requestAndConnect();

      const data = new Uint8Array([0x01, 0x02, 0xff]);
      await adapter.write(data);

      const writtenValue = mockBlePlugin.write.mock.calls[0][0].value;
      expect(writtenValue).toBe('0102ff');
    });

    it('aborts remaining chunks when signal is aborted', async () => {
      mockBlePlugin.requestMtu.mockRejectedValueOnce(new Error('Not supported'));
      await adapter.requestAndConnect();

      const controller = new AbortController();
      // Abort after the first write completes
      mockBlePlugin.write.mockImplementationOnce(async () => {
        controller.abort();
      });

      // 50 bytes / 20 byte chunks = 3 writes normally, but should stop after 1
      const data = new Uint8Array(50);
      await expect(adapter.write(data, controller.signal)).rejects.toThrow('Write aborted');

      // Only the first chunk should have been written
      expect(mockBlePlugin.write).toHaveBeenCalledTimes(1);
    });

    it('throws AbortError immediately when signal is already aborted', async () => {
      await adapter.requestAndConnect();

      const controller = new AbortController();
      controller.abort();

      const data = new Uint8Array([1, 2, 3]);
      await expect(adapter.write(data, controller.signal)).rejects.toThrow('Write aborted');

      expect(mockBlePlugin.write).not.toHaveBeenCalled();
    });
  });

  describe('onDisconnect', () => {
    it('stores callback and returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = adapter.onDisconnect(callback);

      expect(typeof unsub).toBe('function');

      // After unsubscribe, callback should be cleared
      unsub();
    });

    it('fires callback on unexpected disconnect from native layer', async () => {
      const callback = vi.fn();
      adapter.onDisconnect(callback);
      await adapter.requestAndConnect();

      // Simulate the native CoreBluetooth disconnect event
      disconnectListenerCallback?.({ deviceId: 'dev-1' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('ignores disconnect events for other devices', async () => {
      const callback = vi.fn();
      adapter.onDisconnect(callback);
      await adapter.requestAndConnect();

      disconnectListenerCallback?.({ deviceId: 'other-device' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('clears listener handle on unexpected disconnect to prevent orphaned handles', async () => {
      const callback = vi.fn();
      adapter.onDisconnect(callback);
      await adapter.requestAndConnect();

      // Simulate unexpected disconnect
      disconnectListenerCallback?.({ deviceId: 'dev-1' });

      // After unexpected disconnect, write should throw (deviceId cleared)
      await expect(adapter.write(new Uint8Array([1]))).rejects.toThrow('Not connected');

      // Reconnect — should register a fresh listener without orphaning the old one
      mockListenerRemove.mockClear();
      mockBlePlugin.addListener.mockClear();
      await adapter.requestAndConnect();

      expect(mockBlePlugin.addListener).toHaveBeenCalledTimes(1);
      // The old handle was nulled out, so disconnect() won't try to remove it twice
    });

    it('does not fire callback on intentional disconnect', async () => {
      const callback = vi.fn();
      adapter.onDisconnect(callback);
      await adapter.requestAndConnect();

      // Intentional disconnect removes the listener first
      await adapter.disconnect();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // The manual-scan path (custom picker + requestLEScan/stopLEScan) is only
  // taken when a devicePicker is injected. Reconnect-by-serial tries to
  // auto-select silently, then falls back to the picker if the stored board
  // doesn't advertise within a short grace window.
  describe('reconnect-by-serial picker fallback (manual scan)', () => {
    type ManualScanPlugin = typeof mockBlePlugin & {
      requestLEScan?: ReturnType<typeof vi.fn>;
      stopLEScan?: ReturnType<typeof vi.fn>;
    };
    const manualPlugin = mockBlePlugin as ManualScanPlugin;

    let scanResultCb: ((data: unknown) => void) | null = null;
    let pickerResolve: ((deviceId: string) => void) | null = null;
    let devicePicker: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      scanResultCb = null;
      pickerResolve = null;
      manualPlugin.requestLEScan = vi.fn().mockResolvedValue(undefined);
      manualPlugin.stopLEScan = vi.fn().mockResolvedValue(undefined);
      // Route scan-result vs disconnect listeners by event name.
      manualPlugin.addListener = vi.fn().mockImplementation((event: string, cb: (data: unknown) => void) => {
        if (event === 'onScanResult') scanResultCb = cb;
        else disconnectListenerCallback = cb as (data: { deviceId: string }) => void;
        return Promise.resolve({ remove: mockListenerRemove });
      });
      devicePicker = vi.fn((subscribe: (onUpdate: (devices: unknown[]) => void) => void) => {
        subscribe(() => {});
        return new Promise<string>((resolve) => {
          pickerResolve = resolve;
        });
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      delete manualPlugin.requestLEScan;
      delete manualPlugin.stopLEScan;
      // Restore the default disconnect-capturing addListener for other suites.
      manualPlugin.addListener = vi
        .fn()
        .mockImplementation((_event: string, cb: (data: { deviceId: string }) => void) => {
          disconnectListenerCallback = cb;
          return Promise.resolve({ remove: mockListenerRemove });
        });
    });

    const emitScan = (deviceId: string, name: string) =>
      scanResultCb?.({ device: { deviceId, name: undefined }, localName: name, rssi: -50 });

    it('auto-selects the stored board silently without opening the picker', async () => {
      const adapterWithPicker = new CapacitorBleAdapter('kilter', devicePicker as unknown as DevicePickerFn);
      const connectPromise = adapterWithPicker.requestAndConnect('123');

      // Let the scan listener register + scan start.
      await Promise.resolve();
      await Promise.resolve();

      emitScan('dev-x', 'Kilter Board#123@3');

      const connection = await connectPromise;
      expect(connection.deviceId).toBe('dev-x');
      expect(devicePicker).not.toHaveBeenCalled();
      expect(mockBlePlugin.connect).toHaveBeenCalledWith({ deviceId: 'dev-x' });
    });

    it('opens the picker after the grace window when the stored serial never appears', async () => {
      vi.useFakeTimers();
      const adapterWithPicker = new CapacitorBleAdapter('kilter', devicePicker as unknown as DevicePickerFn);
      const connectPromise = adapterWithPicker.requestAndConnect('999');

      // Flush the awaited addListener + requestLEScan microtasks.
      await vi.advanceTimersByTimeAsync(0);

      // A different board shows up — not our serial. Picker stays closed for now.
      emitScan('dev-other', 'Kilter Board#123@3');
      expect(devicePicker).not.toHaveBeenCalled();

      // Grace elapses → picker opens, seeded with discovered devices.
      await vi.advanceTimersByTimeAsync(SERIAL_RECONNECT_GRACE_MS);
      expect(devicePicker).toHaveBeenCalledTimes(1);

      // User picks a board → connect proceeds against their choice.
      pickerResolve?.('dev-other');
      await connectPromise;
      expect(mockBlePlugin.connect).toHaveBeenCalledWith({ deviceId: 'dev-other' });
    });
  });
});
