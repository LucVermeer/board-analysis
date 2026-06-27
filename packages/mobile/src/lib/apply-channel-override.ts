import * as Updates from 'expo-updates';

// Switch the active OTA target by overriding ONLY the `expo-channel-name` request
// header, keeping the build's update URL (so the embedded code-signing cert still
// verifies the manifest). Unlike setUpdateURLAndRequestHeadersOverride, the
// header-only override needs NO `disableAntiBrickingMeasures` — expo-updates
// permits overriding a header that was baked in at build time, and our builds bake
// `expo-channel-name`. It throws if that header wasn't embedded (e.g. EAS-hosted
// builds); callers catch and surface that. `null` clears the override and reverts
// to the build-time channel.
//
// Shared by the tester OTA channel switcher and the preview branch switcher: both
// repoint the running build at a different update target device-locally, with no
// API token and no project-wide channel mutation.
export function applyChannelOverride(channel: string | null): void {
  Updates.setUpdateRequestHeadersOverride(channel === null ? null : { 'expo-channel-name': channel });
}
