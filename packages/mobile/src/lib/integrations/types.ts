import type { SessionSummary } from '@boardsesh/shared-schema';

// Stable identifier for an integration surface. Distinct from the GraphQL
// `IntegrationProvider` ('STRAVA'): device-local integrations (Apple Health)
// are managed on-device and never reach the server, so they have no provider
// enum value. This id is what the UI and the registry key off.
export type IntegrationId = 'apple-health' | 'strava';

// Per-session context the session-end trigger gathers that isn't carried on the
// `SessionSummary` itself: the active board type and the climbedAt timestamps of
// the current user's ascents (mapped to HealthKit `.lap` events).
export type SessionExportContext = {
  boardType: string;
  lapTimestamps: string[];
};

export type IntegrationDefinition = {
  id: IntegrationId;
  // 'device' integrations write on-device (Apple Health). 'platform'
  // integrations are server-side uploads (Strava) that need an OAuth connection.
  kind: 'device' | 'platform';
  // Whether this integration can run on the current platform/device at all.
  isSupported: () => boolean;
  // Fire-and-forget export hook invoked when a session ends. Only device
  // integrations define it — platform uploads run server-side, so Strava omits
  // it. A rejection here must never surface to the user (the registry wraps it).
  autoExportOnSessionEnd?: (summary: SessionSummary, ctx: SessionExportContext) => Promise<void>;
};
