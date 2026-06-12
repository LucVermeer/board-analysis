import { captureError } from './posthog-client';

export type ErrorReportContext = {
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

/**
 * Report an error to PostHog if it is active. No-op otherwise. The optional
 * context lets callers attach triage data such as source, board path, or HTTP
 * status.
 */
export function reportError(error: unknown, context?: ErrorReportContext): void {
  captureError(error, context);
}
