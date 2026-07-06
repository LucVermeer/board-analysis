/**
 * Module-level mirror of the `offline-board-downloads` feature flag, for the
 * non-React offline paths (the GraphQL read interceptor) that can't call
 * `useFeatureFlag`. The value is published from React by `OfflineEngineFlagSync`
 * so the single flag decision — PostHog + env override + tester overrides —
 * happens in one place and this store never disagrees with the UI.
 *
 * Defaults to `false`: until flags load, every user gets the pre-offline
 * network-only behavior, which is the safe direction.
 */

let offlineEngineEnabled = false;

export function setOfflineEngineEnabled(enabled: boolean): void {
  offlineEngineEnabled = enabled;
}

export function isOfflineEngineEnabled(): boolean {
  return offlineEngineEnabled;
}

export function __resetOfflineEngineForTests(): void {
  offlineEngineEnabled = false;
}
