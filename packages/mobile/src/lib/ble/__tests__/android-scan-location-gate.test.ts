import { describe, it, expect } from 'vitest';
import {
  androidBuildHidesScanResultsWithoutLocation,
  MANIFEST_HAS_NEVER_FOR_LOCATION,
} from '../android-scan-location-gate';

describe('androidBuildHidesScanResultsWithoutLocation', () => {
  it('flags Android 12+ while the manifest still omits the disavowal', () => {
    expect(
      androidBuildHidesScanResultsWithoutLocation({
        platformOs: 'android',
        androidApiLevel: 31,
      }),
    ).toBe(true);
  });

  it('keeps flagging the newest Android release', () => {
    // Regression guard: an earlier revision retired the hint for any binary with
    // a versionCode above the last shipped one. app.config.ts keeps
    // `neverForLocation` OFF on purpose, so the next build still needs location
    // and must still get the hint.
    expect(
      androidBuildHidesScanResultsWithoutLocation({
        platformOs: 'android',
        androidApiLevel: 36,
      }),
    ).toBe(true);
  });

  it('stays off below Android 12, where the app already requests fine location', () => {
    expect(
      androidBuildHidesScanResultsWithoutLocation({
        platformOs: 'android',
        androidApiLevel: 30,
      }),
    ).toBe(false);
  });

  it('stays off on iOS', () => {
    expect(
      androidBuildHidesScanResultsWithoutLocation({
        platformOs: 'ios',
        androidApiLevel: 0,
      }),
    ).toBe(false);
  });

  it('pins the manifest flag to what app.config.ts actually declares', () => {
    // `packages/mobile/app.config.ts` documents why `BLUETOOTH_SCAN` keeps its
    // `neverForLocation` flag off (react-native-ble-plx would cap
    // ACCESS_FINE_LOCATION at maxSdkVersion=30 and break expo-location +
    // expo-maps). Flipping this constant without changing the manifest turns the
    // hint off for users who still need it.
    expect(MANIFEST_HAS_NEVER_FOR_LOCATION).toBe(false);
  });
});
