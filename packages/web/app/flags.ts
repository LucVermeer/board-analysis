// A flat bag of runtime feature flags. `Record<string, boolean>` (rather than
// the prior `Record<string, never>`, which made `useFeatureFlag` resolve to
// `never` and was therefore unusable) so consumers can call
// `useFeatureFlag('board-presence')` and get a `boolean | undefined` back. The
// live value is `undefined` (falsy) until a flag source is wired up, so every
// flag is OFF by default — matching the mobile FeatureFlagsProvider placeholder.
export type FeatureFlags = Record<string, boolean>;

export const EMPTY_FEATURE_FLAGS: FeatureFlags = {};

// Vercel's flags discovery endpoint still expects an allFlags export even when
// there are no active runtime flags configured.
export const allFlags: Array<{ key: string }> = [];
