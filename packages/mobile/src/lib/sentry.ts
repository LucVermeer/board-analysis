import type { ComponentType } from 'react';
import * as Sentry from '@sentry/react-native';
import { installGlobalErrorCapture } from './global-error-capture';

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
    // Explicit so a future option change can't silently turn either off. Native
    // crash handling persists SIGABRT/native crashes and uploads them on the
    // next launch; attachStacktrace gives captureMessage calls a stack too.
    enableNativeCrashHandling: true,
    attachStacktrace: true,
    // release/dist are intentionally left unset so @sentry/react-native
    // auto-detects them from the native build (CFBundleShortVersionString +
    // CFBundleVersion). Those are the exact values `sentry-cli react-native
    // xcode` tags the uploaded source maps with, so stack traces symbolicate.
    // Hardcoding release here (e.g. "2.0.0" without dist) would mismatch the
    // uploaded artifacts and break symbolication.
  });
}

// Wrap the RN global error handler regardless of whether Sentry is enabled: the
// console logging and worklet-serialization recovery are valuable even with no
// DSN (dev / DSN-less builds). Installed after Sentry.init so it wraps Sentry's
// handler rather than being clobbered by it.
installGlobalErrorCapture({
  report: (error, context) => reportError(error, context),
  flush: () => (isSentryEnabled ? Sentry.flush() : Promise.resolve(true)),
  isDev: __DEV__,
});

/**
 * Report an error to Sentry if it is active. No-op otherwise. The optional
 * `context` (tags/extra/etc.) is forwarded to `captureException` so callers can
 * attach triage data — e.g. boardPath and HTTP status on a failed session start.
 */
export function reportError(error: unknown, context?: Parameters<typeof Sentry.captureException>[1]): void {
  if (!isSentryEnabled) return;
  Sentry.captureException(error, context);
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
