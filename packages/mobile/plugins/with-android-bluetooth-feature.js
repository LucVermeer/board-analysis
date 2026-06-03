const { createRunOncePlugin, withAndroidManifest } = require('expo/config-plugins');

// Declares BLE as a *recommended* (not required) hardware feature. Play uses
// <uses-feature> for store filtering and device-catalogue ranking. We use
// required="false" on purpose: the app is fully usable without a board (browse
// climbs, manage the queue, view the logbook), so required="true" would
// needlessly hide the listing from BLE-less devices and emulators and drag down
// the Play pre-launch report. The boolean lives in an attribute so the marker
// is the feature name itself — re-running prebuild finds it and no-ops.
const FEATURE_NAME = 'android.hardware.bluetooth_le';

/**
 * Adds `<uses-feature android:name="android.hardware.bluetooth_le"
 * android:required="false" />` to the parsed AndroidManifest. Idempotent: a
 * second pass (or a double-registered plugin) leaves the manifest unchanged.
 * Pure transform over the @expo/config-plugins manifest object for testability.
 *
 * @param {{ manifest: { 'uses-feature'?: Array<{ $: Record<string, string> }> } }} androidManifest
 * @returns {typeof androidManifest}
 */
function addBluetoothLeFeature(androidManifest) {
  const manifest = androidManifest.manifest;
  const usesFeature = manifest['uses-feature'] ?? [];

  const alreadyDeclared = usesFeature.some((feature) => feature?.$?.['android:name'] === FEATURE_NAME);
  if (alreadyDeclared) {
    return androidManifest;
  }

  usesFeature.push({
    $: {
      'android:name': FEATURE_NAME,
      'android:required': 'false',
    },
  });
  manifest['uses-feature'] = usesFeature;

  return androidManifest;
}

function withAndroidBluetoothFeature(config) {
  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = addBluetoothLeFeature(modConfig.modResults);
    return modConfig;
  });
}

module.exports = createRunOncePlugin(withAndroidBluetoothFeature, 'with-android-bluetooth-feature', '1.0.0');
module.exports.addBluetoothLeFeature = addBluetoothLeFeature;
module.exports.FEATURE_NAME = FEATURE_NAME;
