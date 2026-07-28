import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reactNativePermissionHarness,
  resetReactNativePermissionHarness,
} from './react-native-permissions-test-harness';

vi.mock('react-native', async () => {
  const { reactNativePermissionHarness: harness } = await import('./react-native-permissions-test-harness');
  return {
    Platform: harness.platform,
    PermissionsAndroid: harness.permissionsAndroid,
  };
});

import {
  describeBlePermissionDenial,
  getAndroidLocationPermissionState,
  requestAndroidScanLocationPermission,
} from '../android-location-permission';

describe('getAndroidLocationPermissionState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetReactNativePermissionHarness();
  });

  it('never prompts — it only checks', async () => {
    // This runs on every picker open (for telemetry) and on every empty scan
    // (to pick the empty-state copy). Turning it into a `request` would fire a
    // surprise system dialog at both.
    await getAndroidLocationPermissionState();

    expect(reactNativePermissionHarness.permissionsAndroid.check).toHaveBeenCalledWith('ACCESS_FINE_LOCATION');
    expect(reactNativePermissionHarness.permissionsAndroid.check).toHaveBeenCalledWith('ACCESS_COARSE_LOCATION');
    expect(reactNativePermissionHarness.permissionsAndroid.request).not.toHaveBeenCalled();
    expect(reactNativePermissionHarness.permissionsAndroid.requestMultiple).not.toHaveBeenCalled();
  });

  it('counts coarse location as granted — AOSP accepts either for scan delivery', async () => {
    reactNativePermissionHarness.permissionsAndroid.check.mockImplementation(
      async (permission: string) => permission === 'ACCESS_COARSE_LOCATION',
    );

    await expect(getAndroidLocationPermissionState()).resolves.toBe(true);
  });

  it('reports false when neither location permission is held', async () => {
    await expect(getAndroidLocationPermissionState()).resolves.toBe(false);
  });

  it('reports null off Android', async () => {
    reactNativePermissionHarness.platform.OS = 'ios';

    await expect(getAndroidLocationPermissionState()).resolves.toBeNull();
    expect(reactNativePermissionHarness.permissionsAndroid.check).not.toHaveBeenCalled();
  });
});

describe('requestAndroidScanLocationPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetReactNativePermissionHarness();
  });

  it('prompts for fine location and reports the grant', async () => {
    await expect(requestAndroidScanLocationPermission()).resolves.toBe(true);
    expect(reactNativePermissionHarness.permissionsAndroid.request).toHaveBeenCalledWith('ACCESS_FINE_LOCATION');
  });

  it('reports a denial', async () => {
    reactNativePermissionHarness.permissionsAndroid.request.mockResolvedValue('denied');

    await expect(requestAndroidScanLocationPermission()).resolves.toBe(false);
  });

  it('never prompts off Android', async () => {
    reactNativePermissionHarness.platform.OS = 'ios';

    await expect(requestAndroidScanLocationPermission()).resolves.toBe(false);
    expect(reactNativePermissionHarness.permissionsAndroid.request).not.toHaveBeenCalled();
  });
});

describe('describeBlePermissionDenial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetReactNativePermissionHarness();
  });

  it('carries the API level and location state that split a denial from a dead radio', async () => {
    reactNativePermissionHarness.platform.Version = 34;

    await expect(describeBlePermissionDenial()).resolves.toEqual({
      platform: 'android',
      androidApiLevel: 34,
      androidLocationPermissionGranted: false,
    });
  });

  it('nulls the Android-only fields on iOS', async () => {
    reactNativePermissionHarness.platform.OS = 'ios';

    await expect(describeBlePermissionDenial()).resolves.toEqual({
      platform: 'ios',
      androidApiLevel: null,
      androidLocationPermissionGranted: null,
    });
  });
});
