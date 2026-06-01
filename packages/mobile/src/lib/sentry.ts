import type { ComponentType } from 'react';
import * as Sentry from '@sentry/react-native';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * Whether Sentry is active for the current session.
 * False in dev builds and whenever no DSN is configured.
 */
export const isSentryEnabled = !!sentryDsn && !__DEV__;

if (isSentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 0.1,
    // release/dist are intentionally left unset so @sentry/react-native
    // auto-detects them from the native build (CFBundleShortVersionString +
    // CFBundleVersion). Those are the exact values `sentry-cli react-native
    // xcode` tags the uploaded source maps with, so stack traces symbolicate.
    // Hardcoding release here (e.g. "2.0.0" without dist) would mismatch the
    // uploaded artifacts and break symbolication.
  });
}

/**
 * Report an error to Sentry if it is active. No-op otherwise.
 */
export function reportError(error: unknown): void {
  if (!isSentryEnabled) return;
  Sentry.captureException(error);
}

/**
 * Wrap a root component with the Sentry error tracking HOC.
 * Returns the component unchanged when Sentry is not active.
 */
// The constraint mirrors Sentry.wrap's signature exactly. Note: `unknown` is
// the top type, so `Record<string, unknown>` accepts any object props
// (including ReactNode children, callbacks, refs) — the constraint isn't
// actually restrictive in practice.
export function wrapWithSentry<P extends Record<string, unknown>>(component: ComponentType<P>): ComponentType<P> {
  if (!isSentryEnabled) return component;
  return Sentry.wrap(component);
}
