import { PostHog } from 'posthog-node';
import { logger } from '../../utils/logger';

type AnalyticsPropertyValue = string | number | boolean | null | undefined;
type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;
type SanitizedAnalyticsProperties = Record<string, string | number | boolean | null>;
export type BackendAnalyticsEvent =
  | 'Live Activity Ended'
  | 'Live Activity Push Delivery'
  | 'Live Activity Started'
  | 'Live Activity Widget Navigation'
  | 'Live Activity Widget Navigation Attribution Gap';

interface CaptureBackendEventOptions {
  distinctId: string;
  properties?: AnalyticsProperties;
  processPersonProfile?: boolean;
}

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const POSTHOG_FLUSH_AT = 20;
const POSTHOG_FLUSH_INTERVAL_MS = 10_000;

let posthogClient: PostHog | null = null;
let initAttempted = false;

function sanitizeProperties(properties: AnalyticsProperties | undefined): SanitizedAnalyticsProperties {
  const sanitized: SanitizedAnalyticsProperties = {};
  if (!properties) return sanitized;

  for (const [propertyName, propertyValue] of Object.entries(properties)) {
    if (propertyValue !== undefined) {
      sanitized[propertyName] = propertyValue;
    }
  }

  return sanitized;
}

function getPosthogClient(): PostHog | null {
  if (posthogClient) return posthogClient;
  if (initAttempted) return null;
  initAttempted = true;

  const projectKey = process.env.POSTHOG_PROJECT_KEY;
  if (!projectKey) return null;

  const host = process.env.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST;
  const client = new PostHog(projectKey, {
    host,
    flushAt: POSTHOG_FLUSH_AT,
    flushInterval: POSTHOG_FLUSH_INTERVAL_MS,
    disableGeoip: true,
  });

  client.on('error', (error) => {
    logger.warn('[PostHog] SDK error:', error);
  });

  posthogClient = client;
  return client;
}

export function captureBackendEvent(eventName: BackendAnalyticsEvent, options: CaptureBackendEventOptions): boolean {
  const posthog = getPosthogClient();
  if (!posthog) return false;

  const properties = sanitizeProperties(options.properties);
  properties.service = 'boardsesh-backend';
  properties.environment = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development';
  if (options.processPersonProfile === false) {
    properties.$process_person_profile = false;
  }

  try {
    posthog.capture({
      distinctId: options.distinctId,
      event: eventName,
      properties,
    });
    return true;
  } catch (error) {
    logger.warn('[PostHog] Capture failed:', error);
    return false;
  }
}

export async function shutdownPosthog(): Promise<void> {
  const posthog = posthogClient;
  if (!posthog) return;

  posthogClient = null;
  initAttempted = false;

  try {
    await posthog.shutdown();
  } catch (error) {
    logger.warn('[PostHog] Shutdown failed:', error);
  }
}
