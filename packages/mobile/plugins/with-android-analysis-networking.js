const { createRunOncePlugin, withAndroidManifest } = require('expo/config-plugins');

function allowAnalysisHttp(androidManifest) {
  const application = androidManifest.manifest.application?.[0];
  if (!application) return androidManifest;
  application.$ = application.$ ?? {};
  application.$['android:usesCleartextTraffic'] = 'true';
  return androidManifest;
}

function withAndroidAnalysisNetworking(config) {
  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = allowAnalysisHttp(modConfig.modResults);
    return modConfig;
  });
}

module.exports = createRunOncePlugin(withAndroidAnalysisNetworking, 'with-android-analysis-networking', '1.0.0');
module.exports.allowAnalysisHttp = allowAnalysisHttp;
