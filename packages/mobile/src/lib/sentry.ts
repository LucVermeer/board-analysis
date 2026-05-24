import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const sentryDsn = Constants.expoConfig?.extra?.sentryDsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN ?? null;

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
export function wrapWithSentry<P extends Record<string, unknown>>(
  component: React.ComponentType<P>,
): React.ComponentType<P> {
  if (!isSentryEnabled) return component;
  return Sentry.wrap(component);
}
