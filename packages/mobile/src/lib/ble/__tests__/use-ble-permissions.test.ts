import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBleManager = vi.hoisted(() => ({
  state: vi.fn(),
  onStateChange: vi.fn(),
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
  State: {
    PoweredOn: 'PoweredOn',
    PoweredOff: 'PoweredOff',
    Unknown: 'Unknown',
  },
}));

vi.mock('../ble-manager', () => ({
  bleManager: mockBleManager,
}));

import { requestBleRuntimePermissions } from '../use-ble-permissions';

describe('requestBleRuntimePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reactNativeHarness.platform.OS = 'android';
    reactNativeHarness.platform.Version = 31;
    reactNativeHarness.permissionsAndroid.requestMultiple.mockResolvedValue({
      BLUETOOTH_SCAN: 'granted',
      BLUETOOTH_CONNECT: 'granted',
    });
    reactNativeHarness.permissionsAndroid.request.mockResolvedValue('granted');
    mockBleManager.state.mockResolvedValue('PoweredOn');
  });

  it('requests Android 12+ scan and connect permissions', async () => {
    const permissionsGranted = await requestBleRuntimePermissions();

    expect(permissionsGranted).toBe(true);
    expect(reactNativeHarness.permissionsAndroid.requestMultiple).toHaveBeenCalledWith([
      'BLUETOOTH_SCAN',
      'BLUETOOTH_CONNECT',
    ]);
    expect(mockBleManager.state).not.toHaveBeenCalled();
  });

  it('requests fine location on Android 11 and below', async () => {
    reactNativeHarness.platform.Version = 30;
    reactNativeHarness.permissionsAndroid.requestMultiple.mockResolvedValue({
      ACCESS_FINE_LOCATION: 'granted',
    });

    const permissionsGranted = await requestBleRuntimePermissions();

    expect(permissionsGranted).toBe(true);
    expect(reactNativeHarness.permissionsAndroid.requestMultiple).toHaveBeenCalledWith(['ACCESS_FINE_LOCATION']);
  });

  it('returns false when a required Android permission is denied', async () => {
    reactNativeHarness.permissionsAndroid.requestMultiple.mockResolvedValue({
      BLUETOOTH_SCAN: 'granted',
      BLUETOOTH_CONNECT: 'denied',
    });

    const permissionsGranted = await requestBleRuntimePermissions();

    expect(permissionsGranted).toBe(false);
  });

  it('requests Android notification permission without making it part of the BLE gate', async () => {
    reactNativeHarness.platform.Version = 33;
    reactNativeHarness.permissionsAndroid.request.mockResolvedValue('denied');

    const permissionsGranted = await requestBleRuntimePermissions({ requestNotificationPermission: true });

    expect(permissionsGranted).toBe(true);
    expect(reactNativeHarness.permissionsAndroid.request).toHaveBeenCalledWith('POST_NOTIFICATIONS');
  });

  it('checks CoreBluetooth state on iOS instead of Android runtime permissions', async () => {
    reactNativeHarness.platform.OS = 'ios';
    mockBleManager.state.mockResolvedValue('PoweredOn');

    const permissionsGranted = await requestBleRuntimePermissions();

    expect(permissionsGranted).toBe(true);
    expect(mockBleManager.state).toHaveBeenCalledOnce();
    expect(reactNativeHarness.permissionsAndroid.requestMultiple).not.toHaveBeenCalled();
  });
});
