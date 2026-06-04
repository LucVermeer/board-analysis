// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockBleManager = vi.hoisted(() => ({
  state: vi.fn(),
  startDeviceScan: vi.fn(),
  stopDeviceScan: vi.fn(),
}));

const reactNativeHarness = vi.hoisted(() => ({
  platform: {
    OS: 'android' as 'android' | 'ios',
    Version: 31 as number | string,
  },
  permissionsAndroid: {
    PERMISSIONS: {
      ACCESS_FINE_LOCATION: 'ACCESS_FINE_LOCATION',
      BLUETOOTH_SCAN: 'BLUETOOTH_SCAN',
      BLUETOOTH_CONNECT: 'BLUETOOTH_CONNECT',
      POST_NOTIFICATIONS: 'POST_NOTIFICATIONS',
    },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
    },
    requestMultiple: vi.fn(),
    request: vi.fn(),
  },
}));

vi.mock('react-native', () => ({
  Platform: reactNativeHarness.platform,
  PermissionsAndroid: reactNativeHarness.permissionsAndroid,
}));

vi.mock('react-native-ble-plx', () => ({
  State: { PoweredOn: 'PoweredOn', PoweredOff: 'PoweredOff' },
}));

vi.mock('../ble-manager', () => ({ bleManager: mockBleManager }));

vi.mock('@boardsesh/ble-protocol', () => ({
  AURORA_ADVERTISED_SERVICE_UUID: 'aurora-uuid',
  UART_SERVICE_UUID: 'uart-uuid',
  // Treat the device name as the serial for test simplicity.
  parseSerialNumber: (name?: string) => name,
}));

import { useBoardScan } from '../use-board-scan';

/** Grab the scan callback react-native-ble-plx was handed so tests can feed it devices. */
function scanCallback() {
  const call = mockBleManager.startDeviceScan.mock.calls.at(-1);
  return call?.[2] as (error: unknown, device: { localName?: string; name?: string } | null) => void;
}

describe('useBoardScan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    reactNativeHarness.platform.OS = 'android';
    reactNativeHarness.platform.Version = 31;
    reactNativeHarness.permissionsAndroid.requestMultiple.mockResolvedValue({
      BLUETOOTH_SCAN: 'granted',
      BLUETOOTH_CONNECT: 'granted',
    });
    reactNativeHarness.permissionsAndroid.request.mockResolvedValue('granted');
    mockBleManager.state.mockResolvedValue('PoweredOn');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports unavailable when Bluetooth is not powered on', async () => {
    mockBleManager.state.mockResolvedValue('PoweredOff');
    const { result } = renderHook(() => useBoardScan());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('unavailable');
    expect(mockBleManager.startDeviceScan).not.toHaveBeenCalled();
  });

  it('requests Android BLE permissions before checking Bluetooth state', async () => {
    const { result } = renderHook(() => useBoardScan());

    await act(async () => {
      await result.current.start();
    });

    expect(reactNativeHarness.permissionsAndroid.requestMultiple).toHaveBeenCalledWith([
      'BLUETOOTH_SCAN',
      'BLUETOOTH_CONNECT',
    ]);
    expect(reactNativeHarness.permissionsAndroid.requestMultiple.mock.invocationCallOrder[0]).toBeLessThan(
      mockBleManager.state.mock.invocationCallOrder[0],
    );
    expect(result.current.status).toBe('scanning');
  });

  it('reports unavailable when Android BLE permissions are denied', async () => {
    reactNativeHarness.permissionsAndroid.requestMultiple.mockResolvedValue({
      BLUETOOTH_SCAN: 'denied',
      BLUETOOTH_CONNECT: 'granted',
    });
    const { result } = renderHook(() => useBoardScan());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('unavailable');
    expect(mockBleManager.state).not.toHaveBeenCalled();
    expect(mockBleManager.startDeviceScan).not.toHaveBeenCalled();
  });

  it('scans and deduplicates serials from discovered devices', async () => {
    const { result } = renderHook(() => useBoardScan());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('scanning');

    act(() => {
      const cb = scanCallback();
      cb(null, { localName: 'board-A' });
      cb(null, { localName: 'board-B' });
      cb(null, { localName: 'board-A' }); // duplicate
    });

    expect(result.current.serials).toEqual(['board-A', 'board-B']);
  });

  it('stops scanning and reports done after the timeout', async () => {
    const { result } = renderHook(() => useBoardScan());
    await act(async () => {
      await result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(result.current.status).toBe('done');
    expect(mockBleManager.stopDeviceScan).toHaveBeenCalled();
  });

  it('surfaces a scan error as unavailable', async () => {
    const { result } = renderHook(() => useBoardScan());
    await act(async () => {
      await result.current.start();
    });

    act(() => {
      scanCallback()(new Error('scan failed'), null);
    });

    expect(result.current.status).toBe('unavailable');
    expect(mockBleManager.stopDeviceScan).toHaveBeenCalled();
  });

  it('reset() returns to idle and stops an in-flight scan', async () => {
    const { result } = renderHook(() => useBoardScan());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      scanCallback()(null, { localName: 'board-A' });
    });
    expect(result.current.serials).toEqual(['board-A']);

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.serials).toEqual([]);
    expect(mockBleManager.stopDeviceScan).toHaveBeenCalled();
  });

  it('stops scanning on unmount', async () => {
    const { result, unmount } = renderHook(() => useBoardScan());
    await act(async () => {
      await result.current.start();
    });
    mockBleManager.stopDeviceScan.mockClear();

    unmount();

    expect(mockBleManager.stopDeviceScan).toHaveBeenCalled();
  });
});
