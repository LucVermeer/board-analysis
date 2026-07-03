const fs = require('node:fs');
const path = require('node:path');
const { createRunOncePlugin, withDangerousMod } = require('expo/config-plugins');

// React Native 0.86's included Gradle plugin now pins the Foojay resolver
// convention plugin at 1.0.0, which supports Gradle 9 — so the Gradle 9.3.x
// failure that forced this workaround on RN 0.85.3 (Foojay 0.5.0) is likely
// resolved. The 8.14.3 pin is kept conservatively (it's still safe) until a full
// Gradle 9 Android build is validated on RN 0.86; drop this plugin once that's
// confirmed on-device / in CI.
const GRADLE_VERSION = '8.14.3';
const DISTRIBUTION_URL = `https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`;

function applyAndroidGradleWrapperVersion(contents) {
  if (/^distributionUrl=/m.test(contents)) {
    return contents.replace(/^distributionUrl=.*$/m, `distributionUrl=${DISTRIBUTION_URL}`);
  }

  return `${contents.trimEnd()}\ndistributionUrl=${DISTRIBUTION_URL}\n`;
}

function withAndroidGradleWrapperVersion(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const wrapperPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties',
      );
      const contents = fs.readFileSync(wrapperPath, 'utf8');
      fs.writeFileSync(wrapperPath, applyAndroidGradleWrapperVersion(contents));
      return modConfig;
    },
  ]);
}

module.exports = createRunOncePlugin(withAndroidGradleWrapperVersion, 'with-android-gradle-wrapper-version', '1.0.0');
module.exports.applyAndroidGradleWrapperVersion = applyAndroidGradleWrapperVersion;
module.exports.GRADLE_VERSION = GRADLE_VERSION;
module.exports.DISTRIBUTION_URL = DISTRIBUTION_URL;
