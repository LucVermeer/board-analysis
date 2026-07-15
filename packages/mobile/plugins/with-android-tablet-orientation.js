const { createRunOncePlugin, withMainActivity } = require('expo/config-plugins');

// Marker so a second prebuild pass (or a double-registered plugin) is a no-op.
const MARKER = 'boardsesh-tablet-orientation';

/**
 * Injects a size-conditional orientation guard into `MainActivity.onCreate` so
 * `sw600dp` tablets rotate freely — the landscape master-detail shell is their
 * whole point — while phones stay portrait, mirroring the iOS
 * `UISupportedInterfaceOrientations~ipad` override. Android's
 * `android:screenOrientation` manifest attribute can't be resource-qualified by
 * screen size, so this is set at runtime from `smallestScreenWidthDp`. Runs once
 * at activity creation; the app already declares `orientation|screenSize|...` in
 * `android:configChanges`, so a rotation doesn't recreate the activity and the
 * value sticks.
 *
 * Kotlin only (Expo SDK 57 templates); fully-qualified `ActivityInfo` avoids
 * adding an import. Pure string transform over the MainActivity source for
 * testability; idempotent via the marker comment.
 *
 * @param {string} contents MainActivity.kt source
 * @returns {string}
 */
function addTabletOrientation(contents) {
  if (contents.includes(MARKER)) {
    return contents;
  }
  // Anchor on the `super.onCreate(...)` call inside onCreate and inject right
  // after it, preserving the surrounding indentation.
  const anchor = contents.match(/^([ \t]*)super\.onCreate\([^\n)]*\)[ \t]*$/m);
  if (!anchor) {
    throw new Error(
      'with-android-tablet-orientation: could not find `super.onCreate(...)` in MainActivity — ' +
        'the Expo template may have changed; update the anchor.',
    );
  }
  const indent = anchor[1];
  const guard =
    `\n${indent}// ${MARKER}: sw600dp tablets rotate freely; phones stay portrait (mirrors iOS ~ipad).` +
    `\n${indent}requestedOrientation =` +
    `\n${indent}  if (resources.configuration.smallestScreenWidthDp >= 600)` +
    `\n${indent}    android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED` +
    `\n${indent}  else` +
    `\n${indent}    android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT`;
  return contents.replace(anchor[0], `${anchor[0]}${guard}`);
}

function withAndroidTabletOrientation(config) {
  return withMainActivity(config, (modConfig) => {
    if (modConfig.modResults.language !== 'kt') {
      throw new Error(
        `with-android-tablet-orientation: expected a Kotlin MainActivity, got '${modConfig.modResults.language}'.`,
      );
    }
    modConfig.modResults.contents = addTabletOrientation(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = createRunOncePlugin(withAndroidTabletOrientation, 'with-android-tablet-orientation', '1.0.0');
module.exports.addTabletOrientation = addTabletOrientation;
module.exports.MARKER = MARKER;
