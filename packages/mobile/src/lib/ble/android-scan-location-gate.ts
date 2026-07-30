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
// This module decides when to swap the misleading hardware troubleshooting for
// an honest "Android is hiding the scan results until Location is allowed" hint
// plus a grant button.
//
// WHY THE HINT DOES NOT RETIRE ITSELF
// -----------------------------------
// The obvious design is to compare the running binary's Android `versionCode`
// against the last release that shipped without the flag, so the hint falls away
// once a fixed build goes out. That is wrong here: the manifest keeps
// `BLUETOOTH_SCAN` WITHOUT `neverForLocation` on purpose — react-native-ble-plx
// caps ACCESS_FINE_LOCATION at `maxSdkVersion=30` when the flag is present,
// which would break expo-location (board/session discovery) and expo-maps on
// Android 12+. See the `android.permissions` block in
// `packages/mobile/app.config.ts`. Every build we ship next therefore still
// needs location, while a version comparison would have retired the hint on the
// very next build number and left those users back on "make sure your board is
// powered on".
//
// So the gate is an explicit constant that the PR removing that manifest
// constraint has to flip. Note that the flag is a native change: it can only
// arrive in a new binary, whereas this JS constant reaches OLD binaries over the
// air. That PR must therefore also re-introduce a `versionCode` floor
// (expo-application's `nativeBuildVersion`) so binaries built before the
// manifest change keep the hint.

/**
 * Whether the shipped Android manifest declares `BLUETOOTH_SCAN` with
 * `android:usesPermissionFlags="neverForLocation"`.
 *
 * False, and deliberately so: `packages/mobile/app.config.ts` documents why the
 * flag stays off (it would cap ACCESS_FINE_LOCATION at `maxSdkVersion=30` and
 * break expo-location + expo-maps). Flip this only in the PR that actually adds
 * the flag to the manifest, and read the note above about old binaries first.
 */
export const MANIFEST_HAS_NEVER_FOR_LOCATION = false;

/** Android 12. Below this, BLE scanning genuinely requires location and the app already asks for it. */
const ANDROID_12_API_LEVEL = 31;

export type AndroidScanLocationGateInput = {
  /** `Platform.OS`. */
  platformOs: string;
  /** `Platform.Version` on Android, i.e. the API level. */
  androidApiLevel: number;
};

/**
 * True when the running binary's manifest still lets Android suppress scan
 * results for a caller without location permission — i.e. when granting
 * location is a real remedy for an empty scan.
 *
 * Returns false off Android and below Android 12 (the app already requests fine
 * location there, and a denial surfaces as an explicit failure rather than an
 * empty list).
 */
export function androidBuildHidesScanResultsWithoutLocation({
  platformOs,
  androidApiLevel,
}: AndroidScanLocationGateInput): boolean {
  if (platformOs !== 'android') return false;
  if (androidApiLevel < ANDROID_12_API_LEVEL) return false;

  return !MANIFEST_HAS_NEVER_FOR_LOCATION;
}
