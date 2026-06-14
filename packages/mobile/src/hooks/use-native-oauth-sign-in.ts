import { useCallback, useState } from 'react';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { useAuth } from '../providers/auth-provider';
import { track } from '../lib/analytics';
import { reportError } from '../lib/error-reporting';
import { classifyNativeAuthFailureReason, nativeSignInErrorCode } from '../lib/native-auth-analytics';
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
  const { signInWithApple, signInWithGoogle } = useAuth();
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
    [inProgress, isRegistration, setError, signInWithApple, signInWithGoogle, t],
  );

  return { signIn, inProgress };
}
