// Android location-permission reads that sit next to BLE scanning, split out of
// use-ble-permissions.ts on purpose: that module pulls in `react-native-ble-plx`
// (via the BLE manager singleton) for the radio-state hook, and dragging the
// native BLE binding into the bluetooth provider's import graph just to read a
// permission is both wasteful on device and unloadable under Vitest.
//
// Everything here touches `react-native` only.

import { Platform, PermissionsAndroid } from 'react-native';

/** `Platform.Version` as a number on Android (the API level); 0 if unparseable. */
export function androidApiLevel(): number {
  if (typeof Platform.Version === 'number') {
    return Platform.Version;
  }

  const parsedVersion = Number.parseInt(String(Platform.Version), 10);
  return Number.isNaN(parsedVersion) ? 0 : parsedVersion;
}

/**
 * Whether the app currently holds a location permission Android would accept for
 * BLE scan-result delivery (either fine or coarse — AOSP's gate takes either).
 * `null` off Android, or if the check throws.
 *
 * `PermissionsAndroid.check` never prompts, so this is safe to call for
 * telemetry or to decide which empty-state copy to show.
 */
export async function getAndroidLocationPermissionState(): Promise<boolean | null> {
  if (Platform.OS !== 'android') return null;

  try {
    const [fineLocationGranted, coarseLocationGranted] = await Promise.all([
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION),
    ]);
    return fineLocationGranted || coarseLocationGranted;
  } catch {
    return null;
  }
}

/**
 * Prompt for location, used only by the Android 12+ empty-scan hint on binaries
 * whose manifest predates the `neverForLocation` disavowal.
 *
 * Fine AND coarse, in one `requestMultiple`, for two reasons — and the hint is
 * only ever shown on API 31+, so both of them bite every single time:
 *
 *  1. Since Android 12 the platform *ignores* a request for `ACCESS_FINE_LOCATION`
 *     on its own when the app targets 31+: no dialog appears at all and logcat
 *     prints "ACCESS_FINE_LOCATION must be requested with ACCESS_COARSE_LOCATION".
 *     `PermissionsAndroid.request` forwards exactly one permission through to
 *     `ActivityCompat.requestPermissions`, so it cannot pair coarse in for us.
 *  2. From Android 12 the dialog offers "Precise" / "Approximate". Picking
 *     Approximate grants coarse and denies fine — and coarse is enough, because
 *     AOSP's scan-delivery gate accepts either. Treating that as a denial would
 *     leave the user staring at a grant button for a permission they just gave.
 *
 * Resolves true when EITHER permission ended up granted — the same rule
 * `getAndroidLocationPermissionState` applies, so the grant button and the check
 * that decides whether to show it can never disagree.
 */
export async function requestAndroidScanLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);

    return (
      results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
      results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch {
    return false;
  }
}

export type BlePermissionDenialContext = {
  platform: string;
  /** Android API level, or null off Android. */
  androidApiLevel: number | null;
  androidLocationPermissionGranted: boolean | null;
};

/**
 * Context for a `Bluetooth Permission Denied` event. Kept in one place so both
 * denial sites (connect, quickstart scan) report the same shape.
 */
export async function describeBlePermissionDenial(): Promise<BlePermissionDenialContext> {
  return {
    platform: Platform.OS,
    androidApiLevel: Platform.OS === 'android' ? androidApiLevel() : null,
    androidLocationPermissionGranted: await getAndroidLocationPermissionState(),
  };
}
