import { useCallback, useState } from 'react';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { useAuth } from '../providers/auth-provider';
import { track } from '../lib/analytics';
import { reportError } from '../lib/error-reporting';
import { classifyNativeAuthFailureReason, nativeSignInErrorCode } from '../lib/native-auth-analytics';
import type { OAuthSignInResult } from '../lib/auth';
import { useTranslation } from 'react-i18next';

type Provider = 'apple' | 'google';

type Options = {
  /** Tags the analytics funnel so signup OAuth is distinguishable from login OAuth. */
  isRegistration?: boolean;
  /** Where the caller surfaces a translated failure message (and `null` to clear it). */
  setError: (message: string | null) => void;
};

/**
 * The native Apple/Google sign-in flow, shared by the login and register screens
 * so the two can't drift (telemetry, error classification, Sentry tags, and the
 * double-tap guard all live here once). Apple/Google "sign up" is the same
 * find-or-create flow as sign-in, so the only difference between the two callers
 * is the `is_registration` analytics tag. `setError` is injected because login
 * shares one error region with credentials sign-in while register has its own.
 */
export function useNativeOAuthSignIn({ isRegistration = false, setError }: Options) {
  const { signInWithApple, signInWithGoogle, signInWithGoogleWeb } = useAuth();
  const { t } = useTranslation('auth');
  const [inProgress, setInProgress] = useState(false);

  const signIn = useCallback(
    async (provider: Provider) => {
      // A rapid double-tap would open two concurrent native sheets.
      if (inProgress) return;
      setInProgress(true);
      setError(null);
      const registrationProps = isRegistration ? { is_registration: true } : {};
      track(SHARED_EVENTS.LoginAttempted, { auth_method: provider, flow: 'native', ...registrationProps });
      // duration_ms separates a human dismissing the system sheet (seconds) from
      // the flow dying programmatically (sub-second).
      const attemptStartedAt = Date.now();

      // Browser-OAuth fallback for Google. The native SDK can't present its OAuth
      // browser on iOS 26.5.1 (GIDSignIn "Unable to open Safari"), so a native
      // failure isn't fatal — the web NextAuth handoff completes sign-in without
      // the native SDK. Reports its own telemetry under flow: 'web_fallback' so we
      // can measure how often it rescues a native failure, and fully owns the
      // outcome (success returns, a browser cancel stays silent, a real failure
      // reaches error tracking + the error region). Google-only; Apple is fine.
      const runGoogleWebFallback = async (): Promise<void> => {
        const fallbackStartedAt = Date.now();
        track(SHARED_EVENTS.LoginAttempted, { auth_method: provider, flow: 'web_fallback', ...registrationProps });
        let fallback: OAuthSignInResult;
        try {
          fallback = await signInWithGoogleWeb();
        } catch (fallbackError) {
          track(SHARED_EVENTS.LoginFailed, {
            auth_method: provider,
            flow: 'web_fallback',
            failure_reason: 'exception',
            failure_detail: fallbackError instanceof Error ? fallbackError.message : undefined,
            duration_ms: Date.now() - fallbackStartedAt,
            ...registrationProps,
          });
          reportError(fallbackError, {
            tags: { source: 'native-auth', provider, flow: 'web_fallback', mechanism: 'exception' },
          });
          setError(t('nativeStart.oauthError'));
          return;
        }
        if (fallback.success) {
          track(SHARED_EVENTS.LoginSucceeded, { auth_method: provider, flow: 'web_fallback', ...registrationProps });
          setError(null);
          // AuthProvider flips isAuthenticated and the redirect handles navigation.
          return;
        }
        if ('cancelled' in fallback) {
          // The user dismissed the browser — not an error, no message shown.
          track(SHARED_EVENTS.LoginFailed, {
            auth_method: provider,
            flow: 'web_fallback',
            failure_reason: 'cancel',
            duration_ms: Date.now() - fallbackStartedAt,
            ...registrationProps,
          });
          return;
        }
        const fallbackReason = classifyNativeAuthFailureReason(fallback, 'oauth');
        track(SHARED_EVENTS.LoginFailed, {
          auth_method: provider,
          flow: 'web_fallback',
          failure_reason: fallbackReason,
          failure_detail: fallback.error,
          duration_ms: Date.now() - fallbackStartedAt,
          ...registrationProps,
        });
        reportError(new Error(`Web-fallback ${provider} sign-in failed: ${fallback.error}`), {
          level: fallback.error === 'network' ? 'warning' : 'error',
          tags: { source: 'native-auth', provider, flow: 'web_fallback', failure_reason: fallbackReason },
          extra: { status: fallback.status, server_error: fallback.error },
        });
        setError(fallback.error === 'network' ? t('nativeStart.networkError') : t('nativeStart.oauthError'));
      };

      try {
        const result = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
        if (result.success) {
          track(SHARED_EVENTS.LoginSucceeded, { auth_method: provider, flow: 'native', ...registrationProps });
          // AuthProvider flips isAuthenticated and the redirect handles navigation.
          return;
        }
        if ('cancelled' in result) {
          // The user dismissed the provider sheet — not an error, no message shown.
          track(SHARED_EVENTS.LoginFailed, {
            auth_method: provider,
            flow: 'native',
            failure_reason: 'cancel',
            duration_ms: Date.now() - attemptStartedAt,
            ...registrationProps,
          });
          return;
        }
        // A real backend/token failure carrying the server's status + error.
        const oauthFailureReason = classifyNativeAuthFailureReason(result, 'oauth');
        track(SHARED_EVENTS.LoginFailed, {
          auth_method: provider,
          flow: 'native',
          failure_reason: oauthFailureReason,
          failure_detail: result.error,
          duration_ms: Date.now() - attemptStartedAt,
          ...registrationProps,
        });
        // Google native failures are recoverable in the browser — the fallback owns
        // the user-facing outcome and error tracking from here.
        if (provider === 'google') {
          await runGoogleWebFallback();
          return;
        }
        // Surface to error tracking too: an OAuth 401 / no_id_token is a config
        // bug (client-id audience mismatch, unconfigured backend) rather than a
        // user typo. Network blips downgrade to a warning.
        reportError(new Error(`Native ${provider} sign-in failed: ${result.error}`), {
          level: result.error === 'network' ? 'warning' : 'error',
          tags: { source: 'native-auth', provider, flow: 'native', failure_reason: oauthFailureReason },
          extra: { status: result.status, server_error: result.error },
        });
        setError(result.error === 'network' ? t('nativeStart.networkError') : t('nativeStart.oauthError'));
      } catch (oauthError) {
        // The native module threw (Play Services missing, no presenter, a
        // signing/client-id mismatch, …). Prefer the native `.code` for
        // failure_detail — far more actionable than the opaque message.
        const nativeErrorCode = nativeSignInErrorCode(oauthError);
        track(SHARED_EVENTS.LoginFailed, {
          auth_method: provider,
          flow: 'native',
          failure_reason: 'exception',
          failure_detail: nativeErrorCode ?? (oauthError instanceof Error ? oauthError.message : undefined),
          duration_ms: Date.now() - attemptStartedAt,
          ...registrationProps,
        });
        // The iOS 26.5.1 "Unable to open Safari" GIDSignIn throw lands here — recover
        // via the browser flow instead of reporting it and dead-ending the user.
        if (provider === 'google') {
          await runGoogleWebFallback();
          return;
        }
        reportError(oauthError, {
          tags: {
            source: 'native-auth',
            provider,
            flow: 'native',
            mechanism: 'exception',
            native_error_code: nativeErrorCode,
          },
        });
        setError(t('nativeStart.oauthError'));
      } finally {
        setInProgress(false);
      }
    },
    [inProgress, isRegistration, setError, signInWithApple, signInWithGoogle, signInWithGoogleWeb, t],
  );

  return { signIn, inProgress };
}
