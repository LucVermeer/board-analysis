const { createRunOncePlugin, withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

// There is no committed android/ (managed Expo), so the foreground Service and
// its action BroadcastReceiver must be injected into the generated
// AndroidManifest.xml at prebuild time. The FGS permissions
// (FOREGROUND_SERVICE / FOREGROUND_SERVICE_CONNECTED_DEVICE / POST_NOTIFICATIONS)
// are declared via app.config.ts android.permissions; this plugin owns only the
// <service> + <receiver> elements that android.permissions can't express.
const SERVICE_NAME = 'com.boardsesh.liveactivity.BoardSessionService';
const RECEIVER_NAME = 'com.boardsesh.liveactivity.BoardSessionActionReceiver';

/**
 * Adds the BoardSessionService (foregroundServiceType=connectedDevice) and the
 * BoardSessionActionReceiver to the <application>. Idempotent: keyed on the
 * fully-qualified class names, so a repeated prebuild / double registration is a
 * no-op. Pure transform over the parsed manifest for testability.
 *
 * @param {object} androidManifest - the @expo/config-plugins AndroidManifest object
 * @returns {object} the mutated manifest
 */
function addSessionService(androidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

  application.service = application.service ?? [];
  const hasService = application.service.some((entry) => entry?.$?.['android:name'] === SERVICE_NAME);
  if (!hasService) {
    application.service.push({
      $: {
        'android:name': SERVICE_NAME,
        'android:exported': 'false',
        'android:foregroundServiceType': 'connectedDevice',
      },
    });
  }

  application.receiver = application.receiver ?? [];
  const hasReceiver = application.receiver.some((entry) => entry?.$?.['android:name'] === RECEIVER_NAME);
  if (!hasReceiver) {
    application.receiver.push({
      $: {
        'android:name': RECEIVER_NAME,
        'android:exported': 'false',
      },
    });
  }

  return androidManifest;
}

function withAndroidSessionService(config) {
  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = addSessionService(modConfig.modResults);
    return modConfig;
  });
}

module.exports = createRunOncePlugin(withAndroidSessionService, 'with-android-session-service', '1.0.0');
module.exports.addSessionService = addSessionService;
module.exports.SERVICE_NAME = SERVICE_NAME;
module.exports.RECEIVER_NAME = RECEIVER_NAME;
