// Over-the-air (OTA) preview channel types. A per-PR `pr-<number>` channel lets
// a user switch a store/TestFlight build onto a pull request's JS bundle before
// it ships — see docs/mobile-ota-updates.md. The list is derived from the
// GitHub `pr-preview` deployments the mobile-ota-preview workflow publishes, so
// only channels that are actually live appear.

export type OtaPreviewChannel = {
  // The OTA channel name to switch onto, e.g. "pr-3253".
  channel: string;
  // The pull request number.
  prNumber: number;
  // The pull request title, for display.
  title: string;
  // The pull request web URL.
  url: string;
};
