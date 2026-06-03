const { createRunOncePlugin, withGradleProperties } = require('expo/config-plugins');

// Bounds the Gradle JVM heap and parallel worker count in the generated
// android/gradle.properties. Without this the release build (CMake across 4 ABIs
// for board-renderer + Kotlin + JS bundling + R8) spikes past the runner's RAM
// and the Gradle daemon gets OOM-killed ("Gradle build daemon disappeared").
// Capping workers serializes the memory-heavy native compiles. Applies to every
// Android build (sideload APK, Play AAB, EAS).
const PROPS = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',
  'org.gradle.workers.max': '2',
  'org.gradle.parallel': 'false',
};

/**
 * Upserts the memory/concurrency properties into the parsed gradle.properties.
 * Pure transform for testability.
 *
 * @param {Array<{type: string, key?: string, value?: string}>} gradleProps
 * @returns {Array<{type: string, key?: string, value?: string}>}
 */
function applyGradleMemory(gradleProps) {
  for (const [key, value] of Object.entries(PROPS)) {
    const existing = gradleProps.find((entry) => entry.type === 'property' && entry.key === key);
    if (existing) {
      existing.value = value;
    } else {
      gradleProps.push({ type: 'property', key, value });
    }
  }
  return gradleProps;
}

function withAndroidGradleMemory(config) {
  return withGradleProperties(config, (modConfig) => {
    modConfig.modResults = applyGradleMemory(modConfig.modResults);
    return modConfig;
  });
}

module.exports = createRunOncePlugin(withAndroidGradleMemory, 'with-android-gradle-memory', '1.0.0');
module.exports.applyGradleMemory = applyGradleMemory;
module.exports.PROPS = PROPS;
