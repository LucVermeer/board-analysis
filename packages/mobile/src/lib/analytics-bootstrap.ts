// Side-effect-only module: resolves the party-profile UUID synchronously and
// stores it in the analytics-bootstrap-id slot. Import this exactly once, from
// app/_layout.tsx, BEFORE anything that imports posthog-client.ts (directly or
// via AnalyticsProvider/analytics.ts) — ES module evaluation runs each import
// in file order, so as long as this import line comes first, the slot is
// populated before posthog-client.ts's own module-eval side effect reads it to
// construct the PostHog client.
//
// This is the one module allowed to pull in expo-secure-store (via
// party-profile-store.ts) from the analytics call graph; keep that import out
// of posthog-client.ts/analytics.ts directly, or their existing RN-free module
// graph — and the node-env tests that depend on it — breaks.
import { getOrCreatePartyProfileIdSync } from './party-profile-store';
import { setAnalyticsBootstrapId } from './analytics-bootstrap-id';

setAnalyticsBootstrapId(getOrCreatePartyProfileIdSync());
