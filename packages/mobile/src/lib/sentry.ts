import type { ComponentType } from 'react';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

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
    // Attach release info so source maps match
    release: Constants.expoConfig?.version ?? undefined,
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
