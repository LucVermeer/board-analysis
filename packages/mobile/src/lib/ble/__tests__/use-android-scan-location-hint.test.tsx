// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const nativeBuild = vi.hoisted(() => ({ version: '2000700' as string | null }));
vi.mock('expo-application', () => ({
  get nativeBuildVersion() {
    return nativeBuild.version;
  },
}));

const platform = vi.hoisted(() => ({ OS: 'android' as string, apiLevel: 34 }));
vi.mock('react-native', () => ({
  get Platform() {
    return { OS: platform.OS };
  },
}));

const permissions = vi.hoisted(() => ({
  androidApiLevel: vi.fn(() => platform.apiLevel),
  getAndroidLocationPermissionState: vi.fn(async (): Promise<boolean | null> => false),
  requestAndroidScanLocationPermission: vi.fn(async () => true),
}));
vi.mock('../android-location-permission', () => permissions);

import { useAndroidScanLocationHint } from '../use-android-scan-location-hint';
import { LAST_ANDROID_VERSION_CODE_WITHOUT_SCAN_DISAVOWAL } from '../android-scan-location-gate';

describe('useAndroidScanLocationHint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform.OS = 'android';
    platform.apiLevel = 34;
    nativeBuild.version = '2000700';
    permissions.androidApiLevel.mockImplementation(() => platform.apiLevel);
    permissions.getAndroidLocationPermissionState.mockResolvedValue(false);
    permissions.requestAndroidScanLocationPermission.mockResolvedValue(true);
  });

  it('offers the grant once an empty scan meets a location denial on an un-fixed build', async () => {
    const { result } = renderHook(() => useAndroidScanLocationHint(true));

    await waitFor(() => {
      expect(result.current.shouldOfferLocationGrant).toBe(true);
    });
  });

  it('stays quiet while the scan is still running or found boards', async () => {
    const { result } = renderHook(() => useAndroidScanLocationHint(false));

    // No permission read at all — this hook must not fire a PermissionsAndroid
    // call on every scan tick.
    expect(permissions.getAndroidLocationPermissionState).not.toHaveBeenCalled();
    expect(result.current.shouldOfferLocationGrant).toBe(false);
  });

  it('stays quiet when location is already granted — the empty list is real', async () => {
    permissions.getAndroidLocationPermissionState.mockResolvedValue(true);
    const { result } = renderHook(() => useAndroidScanLocationHint(true));

    await waitFor(() => {
      expect(permissions.getAndroidLocationPermissionState).toHaveBeenCalled();
    });
    expect(result.current.shouldOfferLocationGrant).toBe(false);
  });

  it('never reads the permission on a build that already carries the manifest flag', async () => {
    nativeBuild.version = String(LAST_ANDROID_VERSION_CODE_WITHOUT_SCAN_DISAVOWAL + 1);
    const { result } = renderHook(() => useAndroidScanLocationHint(true));

    expect(permissions.getAndroidLocationPermissionState).not.toHaveBeenCalled();
    expect(result.current.shouldOfferLocationGrant).toBe(false);
  });

  it('never reads the permission on iOS', async () => {
    platform.OS = 'ios';
    const { result } = renderHook(() => useAndroidScanLocationHint(true));

    expect(permissions.getAndroidLocationPermissionState).not.toHaveBeenCalled();
    expect(result.current.shouldOfferLocationGrant).toBe(false);
  });

  it('swaps to the granted state after a successful request', async () => {
    const { result } = renderHook(() => useAndroidScanLocationHint(true));
    await waitFor(() => {
      expect(result.current.shouldOfferLocationGrant).toBe(true);
    });

    await act(async () => {
      await result.current.requestLocationPermission();
    });

    expect(permissions.requestAndroidScanLocationPermission).toHaveBeenCalledOnce();
    expect(result.current.wasGranted).toBe(true);
    expect(result.current.shouldOfferLocationGrant).toBe(false);
  });

  it('keeps offering the grant after a denial', async () => {
    permissions.requestAndroidScanLocationPermission.mockResolvedValue(false);
    const { result } = renderHook(() => useAndroidScanLocationHint(true));
    await waitFor(() => {
      expect(result.current.shouldOfferLocationGrant).toBe(true);
    });

    await act(async () => {
      await result.current.requestLocationPermission();
    });

    expect(result.current.wasGranted).toBe(false);
    expect(result.current.shouldOfferLocationGrant).toBe(true);
  });

  it('drops a late permission read that resolves after the empty state closed', async () => {
    let resolveCheck: ((granted: boolean) => void) | undefined;
    permissions.getAndroidLocationPermissionState.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCheck = resolve;
        }),
    );

    const { result, rerender } = renderHook(({ active }) => useAndroidScanLocationHint(active), {
      initialProps: { active: true },
    });
    rerender({ active: false });

    await act(async () => {
      resolveCheck?.(false);
    });

    // A stale "location is denied" answer must not light the hint back up on a
    // picker that has since found boards or closed.
    expect(result.current.shouldOfferLocationGrant).toBe(false);
  });

  it('drops a late permission read that resolves after the user granted', async () => {
    // The system prompt is the newer, more authoritative answer. A `check` that
    // started before it and lands after must not put the grant button straight
    // back in front of someone who just accepted.
    let resolveCheck: ((granted: boolean) => void) | undefined;
    permissions.getAndroidLocationPermissionState.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCheck = resolve;
        }),
    );

    const { result } = renderHook(() => useAndroidScanLocationHint(true));

    await act(async () => {
      await result.current.requestLocationPermission();
    });
    expect(result.current.wasGranted).toBe(true);

    await act(async () => {
      resolveCheck?.(false);
    });

    expect(result.current.shouldOfferLocationGrant).toBe(false);
    expect(result.current.wasGranted).toBe(true);
  });
});
