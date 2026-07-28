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

  it('asks for fine AND coarse together — Android 12 silently drops a fine-only request', async () => {
    // The hint is only ever shown on API 31+, so this is not an edge case: an
    // app targeting 31+ that requests ACCESS_FINE_LOCATION alone gets no dialog
    // at all and "ACCESS_FINE_LOCATION must be requested with
    // ACCESS_COARSE_LOCATION" in logcat. PermissionsAndroid.request forwards a
    // single permission, so requestMultiple is the only way to pair them.
    reactNativePermissionHarness.permissionsAndroid.requestMultiple.mockResolvedValue({
      ACCESS_FINE_LOCATION: 'granted',
      ACCESS_COARSE_LOCATION: 'granted',
    });

    await expect(requestAndroidScanLocationPermission()).resolves.toBe(true);
    expect(reactNativePermissionHarness.permissionsAndroid.requestMultiple).toHaveBeenCalledWith([
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
    ]);
    expect(reactNativePermissionHarness.permissionsAndroid.request).not.toHaveBeenCalled();
  });

  it('counts "Approximate" as a grant — coarse alone unblocks scan delivery', async () => {
    // Android 12+ dialogs offer Precise/Approximate. Approximate grants coarse
    // and denies fine; AOSP's scan-delivery gate takes either, so calling that a
    // denial would leave the user staring at a button for a permission they just
    // gave, and would stop the quickstart sheet re-scanning.
    reactNativePermissionHarness.permissionsAndroid.requestMultiple.mockResolvedValue({
      ACCESS_FINE_LOCATION: 'denied',
      ACCESS_COARSE_LOCATION: 'granted',
    });

    await expect(requestAndroidScanLocationPermission()).resolves.toBe(true);
  });

  it('reports a denial', async () => {
    reactNativePermissionHarness.permissionsAndroid.requestMultiple.mockResolvedValue({
      ACCESS_FINE_LOCATION: 'denied',
      ACCESS_COARSE_LOCATION: 'never_ask_again',
    });

    await expect(requestAndroidScanLocationPermission()).resolves.toBe(false);
  });

  it('never prompts off Android', async () => {
    reactNativePermissionHarness.platform.OS = 'ios';

    await expect(requestAndroidScanLocationPermission()).resolves.toBe(false);
    expect(reactNativePermissionHarness.permissionsAndroid.requestMultiple).not.toHaveBeenCalled();
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
