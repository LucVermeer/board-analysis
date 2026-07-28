import { describe, it, expect } from 'vitest';
import {
  androidBuildHidesScanResultsWithoutLocation,
  LAST_ANDROID_VERSION_CODE_WITHOUT_SCAN_DISAVOWAL,
} from '../android-scan-location-gate';

const LAST_UNFIXED = LAST_ANDROID_VERSION_CODE_WITHOUT_SCAN_DISAVOWAL;

describe('androidBuildHidesScanResultsWithoutLocation', () => {
  it('flags a shipped Android 12+ build whose manifest predates the disavowal', () => {
    expect(
      androidBuildHidesScanResultsWithoutLocation({
        platformOs: 'android',
        androidApiLevel: 31,
        nativeBuildVersion: String(LAST_UNFIXED),
      }),
    ).toBe(true);
  });

  it('retires itself on the next Android build', () => {
    // The whole point of the gate: the binary that carries the manifest fix has
    // a strictly higher versionCode (CI's max(sideload floor, Play ceiling + 1)),
    // so nobody has to remember to delete this hint.
    expect(
      androidBuildHidesScanResultsWithoutLocation({
        platformOs: 'android',
        androidApiLevel: 34,
        nativeBuildVersion: String(LAST_UNFIXED + 1),
      }),
    ).toBe(false);
  });

  it('stays off below Android 12, where the app already requests fine location', () => {
    expect(
      androidBuildHidesScanResultsWithoutLocation({
        platformOs: 'android',
        androidApiLevel: 30,
        nativeBuildVersion: String(LAST_UNFIXED),
      }),
    ).toBe(false);
  });

  it('stays off on iOS', () => {
    expect(
      androidBuildHidesScanResultsWithoutLocation({
        platformOs: 'ios',
        androidApiLevel: 0,
        nativeBuildVersion: '1',
      }),
    ).toBe(false);
  });

  it('assumes the un-fixed manifest when the build number is unreadable', () => {
    for (const nativeBuildVersion of [null, '', 'not-a-number']) {
      expect(
        androidBuildHidesScanResultsWithoutLocation({
          platformOs: 'android',
          androidApiLevel: 33,
          nativeBuildVersion,
        }),
      ).toBe(true);
    }
  });

  it('pins the constant to the shipped Android release-tag ceiling', () => {
    // Sourced from the highest `build-android-v<version>-<versionCode>-<sha>`
    // tag. Raising this by hand is only ever right if a build newer than it also
    // shipped without `neverForLocation`; lowering it silently strands the fleet
    // this hint exists for.
    expect(LAST_ANDROID_VERSION_CODE_WITHOUT_SCAN_DISAVOWAL).toBe(2_000_753);
  });
});
