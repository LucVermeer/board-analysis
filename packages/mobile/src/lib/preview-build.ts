import * as Updates from 'expo-updates';

// A "preview build" is an internal-distribution EAS build (eas.json `preview`
// profile → channel `preview-1`). Those builds — and only those — surface the
// in-app Branch Switcher so a tester can repoint the running build at another
// branch's OTA device-locally.
//
// We key off the build-time channel rather than an embedded token: `Updates.channel`
// is the channel baked into the binary and is unaffected by a runtime header
// override, so this stays stable even after the tester switches branches. Dev /
// Expo Go builds have no channel (returns `null`) and are excluded; production
// builds are on `production`.
export function isPreviewBuild(): boolean {
  return (Updates.channel ?? '').startsWith('preview');
}
