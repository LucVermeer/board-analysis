import { describe, expect, it } from 'vite-plus/test';

type AnalysisNetworkingPlugin = {
  allowAnalysisHttp: (manifest: AndroidManifest) => AndroidManifest;
};

type AndroidManifest = {
  manifest: { application?: Array<{ $?: Record<string, string> }> };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../../../plugins/with-android-analysis-networking.js') as AnalysisNetworkingPlugin;

describe('analysis networking plugin', () => {
  it('allows workstation HTTP video traffic in the Android manifest', () => {
    const manifest: AndroidManifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } };

    expect(plugin.allowAnalysisHttp(manifest).manifest.application?.[0]?.$).toMatchObject({
      'android:name': '.MainApplication',
      'android:usesCleartextTraffic': 'true',
    });
  });
});
