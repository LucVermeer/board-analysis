// Why a zero-result BLE scan on Android 12+ is often a *permission* problem.
//
// On API 31+ the platform treats every BLE scan as potentially location-deriving
// unless the app's `BLUETOOTH_SCAN` declaration carries
// `android:usesPermissionFlags="neverForLocation"`. Without that flag, AOSP's
// scan path gates each delivered ScanResult on the caller holding
// ACCESS_FINE_LOCATION or ACCESS_COARSE_LOCATION — and drops the results in the
// delivery loop rather than rejecting `startScan()`. The app sees a scan that
// starts fine, reports no error, and finds nothing.
//
// Boardsesh's runtime request on API 31+ asks only for BLUETOOTH_SCAN /
// BLUETOOTH_CONNECT (correct, and what we want long term), so a user who
// declined the separate "find boards near you" location prompt gets a
// permanently empty board picker with troubleshooting copy blaming their board.
//
// The real fix is the manifest flag, but that moves the native fingerprint and
// therefore cannot reach installed binaries over the air. This module is the
// JS-only half: it decides when to swap the misleading hardware troubleshooting
// for an honest "Android is hiding the scan results until Location is allowed"
// hint plus a grant button.
//
// SELF-RETIRING GATE
// ------------------
// The hint must disappear the moment a binary ships with the manifest flag,
// otherwise we would be asking for a permission we no longer need. We compare
// the running binary's Android `versionCode` (expo-application's
// `nativeBuildVersion`) against the highest versionCode that shipped WITHOUT the
// flag. versionCode is monotonic across our Android releases (see
// .github/workflows/android-apk-rn.yml — `max(sideload floor, Play ceiling + 1)`),
// so every build produced after the manifest fix lands is strictly greater and
// automatically opts out.
//
// Deliberately NOT gated on `expoConfig.extra` or any other JS-side constant:
// an OTA update rewrites those on old binaries, so they cannot distinguish an
// old binary running new JS from a new binary.

/**
 * Highest Android `versionCode` known to ship a manifest WITHOUT
 * `neverForLocation` on `BLUETOOTH_SCAN`.
 *
 * Sourced from the `build-android-v<version>-<versionCode>-<sha>` release tags,
 * whose ceiling at the time of writing is `build-android-v2.3.0-2000753`. There
 * is no `versionCode` in `app.config.ts` to read — CI computes it per build and
 * seds it into `android/app/build.gradle` — so this constant tracks the shipped
 * tag ceiling instead.
 *
 * When the `neverForLocation` manifest change ships, this value does NOT need
 * updating: the fixed build's versionCode is necessarily higher, so it falls out
 * of the gate on its own. It only needs raising if a build BETWEEN this value
 * and the manifest fix somehow still lacks the flag.
 */
export const LAST_ANDROID_VERSION_CODE_WITHOUT_SCAN_DISAVOWAL = 2_000_753;

/** Android 12. Below this, BLE scanning genuinely requires location and the app already asks for it. */
const ANDROID_12_API_LEVEL = 31;

export type AndroidScanLocationGateInput = {
  /** `Platform.OS`. */
  platformOs: string;
  /** `Platform.Version` on Android, i.e. the API level. */
  androidApiLevel: number;
  /** expo-application's `nativeBuildVersion` — the Android `versionCode` as a string. */
  nativeBuildVersion: string | null;
};

/**
 * True when the running binary's manifest still lets Android suppress scan
 * results for a caller without location permission — i.e. when granting
 * location is a real remedy for an empty scan.
 *
 * Returns false off Android, below Android 12 (the app already requests fine
 * location there, and a denial surfaces as an explicit failure rather than an
 * empty list), and on any build newer than the last un-disavowed one.
 */
export function androidBuildHidesScanResultsWithoutLocation({
  platformOs,
  androidApiLevel,
  nativeBuildVersion,
}: AndroidScanLocationGateInput): boolean {
  if (platformOs !== 'android') return false;
  if (androidApiLevel < ANDROID_12_API_LEVEL) return false;

  const versionCode = Number.parseInt(nativeBuildVersion ?? '', 10);
  // Unreadable build number: assume the un-fixed manifest. The hint is only ever
  // reachable when a scan ALREADY came back empty and location is ALREADY
  // denied, so being wrong here costs one superfluous tip; being wrong the other
  // way leaves affected users staring at "make sure your board is powered on".
  if (Number.isNaN(versionCode)) return true;

  return versionCode <= LAST_ANDROID_VERSION_CODE_WITHOUT_SCAN_DISAVOWAL;
}
