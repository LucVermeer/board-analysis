import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput as RNTextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { useTranslation } from 'react-i18next';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { classifyNativeAuthFailureReason, nativeSignInErrorCode } from '../../src/lib/native-auth-analytics';
import { isGoogleSignInConfigured } from '../../src/lib/auth';
import { EMAIL_REGEX } from '../../src/lib/auth-validation';
import { useAuth } from '../../src/providers/auth-provider';
import { useTheme } from '../../src/providers/theme-provider';
import { AuthTextInput } from '../../src/components/AuthTextInput';
import { Button } from '../../src/components/Button';
import { track } from '../../src/lib/analytics';
import { reportError } from '../../src/lib/error-reporting';
import { hapticLight } from '../../src/lib/haptics';

export default function LoginScreen() {
  const { signInWithApple, signInWithGoogle, signInWithCredentials } = useAuth();
  const { t } = useTranslation('auth');
  const theme = useTheme();
  const router = useRouter();
  const passwordRef = useRef<RNTextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthInProgress, setOauthInProgress] = useState(false);

  const trimmedEmail = email.trim();
  const canSubmit = !submitting && trimmedEmail.length > 0 && password.length > 0;

  async function onSubmit() {
    if (!canSubmit) return;

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError(t('login.validation.emailInvalid'));
      return;
    }

    setError(null);
    setSubmitting(true);
    track(SHARED_EVENTS.LoginAttempted, { auth_method: 'credentials', flow: 'native' });
    try {
      const result = await signInWithCredentials(trimmedEmail, password);
      if (!result.success) {
        const credentialsFailureReason = classifyNativeAuthFailureReason(result, 'credentials');
        track(SHARED_EVENTS.LoginFailed, {
          auth_method: 'credentials',
          failure_reason: credentialsFailureReason,
          failure_detail: result.error,
        });
        if (result.error === 'network') {
          setError(t('nativeStart.networkError'));
        } else if (result.status === 401) {
          // Wrong email/password is a normal user error, not telemetry-worthy.
          setError(t('login.toasts.invalidCredentials'));
        } else {
          // An unexpected backend failure (5xx, malformed response, …) — report
          // it so a broken credentials endpoint is visible, not just a red toast.
          reportError(new Error(`Credentials sign-in failed: ${result.error}`), {
            tags: {
              source: 'native-auth',
              provider: 'credentials',
              flow: 'native',
              failure_reason: credentialsFailureReason,
            },
            extra: { status: result.status, server_error: result.error },
          });
          setError(result.error);
        }
      } else {
        track(SHARED_EVENTS.LoginSucceeded, { auth_method: 'credentials', flow: 'native' });
      }
      // On success, AuthProvider flips isAuthenticated and the redirect handles navigation.
    } catch (signInError) {
      track(SHARED_EVENTS.LoginFailed, {
        auth_method: 'credentials',
        failure_reason: 'exception',
      });
      throw signInError;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOAuthSignIn(provider: 'apple' | 'google') {
    // A rapid double-tap would open two concurrent native sheets.
    if (oauthInProgress) return;
    setOauthInProgress(true);
    setError(null);
    track(SHARED_EVENTS.LoginAttempted, { auth_method: provider, flow: 'native' });
    // duration_ms separates a human dismissing the system sheet (seconds) from
    // the flow dying programmatically (sub-second).
    const attemptStartedAt = Date.now();
    try {
      const result = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      if (result.success) {
        track(SHARED_EVENTS.LoginSucceeded, { auth_method: provider, flow: 'native' });
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
      });
      // Surface to error tracking too: an OAuth 401 / no_id_token is a config
      // bug (client-id audience mismatch, unconfigured backend) rather than a
      // user typo, so it's worth a $exception carrying the status + server
      // message. Network blips downgrade to a warning (handled by report level).
      reportError(new Error(`Native ${provider} sign-in failed: ${result.error}`), {
        level: result.error === 'network' ? 'warning' : 'error',
        tags: { source: 'native-auth', provider, flow: 'native', failure_reason: oauthFailureReason },
        extra: { status: result.status, server_error: result.error },
      });
      setError(result.error === 'network' ? t('nativeStart.networkError') : t('nativeStart.oauthError'));
    } catch (oauthError) {
      // The native module threw (Play Services missing, no presenter,
      // DEVELOPER_ERROR for a signing/client-id mismatch, …). The native `.code`
      // (e.g. DEVELOPER_ERROR) is far more actionable than the opaque message, so
      // prefer it for failure_detail and tag it for filtering.
      const nativeErrorCode = nativeSignInErrorCode(oauthError);
      track(SHARED_EVENTS.LoginFailed, {
        auth_method: provider,
        flow: 'native',
        failure_reason: 'exception',
        failure_detail: nativeErrorCode ?? (oauthError instanceof Error ? oauthError.message : undefined),
        duration_ms: Date.now() - attemptStartedAt,
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
      setOauthInProgress(false);
    }
  }

  const isDark = theme.colorScheme === 'dark';

  // Sign in with Apple is iOS-only; Google only when the build shipped its
  // native config (an Apple-only / misconfigured build hides it rather than
  // showing a button that fails on tap). Hide the whole social section if
  // neither is available so the divider doesn't dangle.
  const showAppleSignIn = Platform.OS === 'ios';
  const showGoogleSignIn = isGoogleSignInConfigured();
  const showSocialSignIn = showAppleSignIn || showGoogleSignIn;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.header}>
          <Image
            source={require('../../assets/splash-icon.png')}
            style={styles.logo}
            contentFit="contain"
            accessible={false}
          />
          <Text style={[styles.title, { color: theme.brandColors.primary }]}>Boardsesh</Text>
          <Text style={[styles.subtitle, { color: theme.systemColors.secondaryLabel }]}>
            {t('nativeStart.tagline')}
          </Text>
        </View>

        <View style={styles.form}>
          <AuthTextInput
            label={t('login.fields.email')}
            value={email}
            onChangeText={setEmail}
            placeholder={t('login.placeholders.email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!submitting}
          />
          <AuthTextInput
            ref={passwordRef}
            label={t('login.fields.password')}
            value={password}
            onChangeText={setPassword}
            placeholder={t('login.placeholders.password')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="password"
            returnKeyType="done"
            onSubmitEditing={() => {
              void onSubmit();
            }}
            editable={!submitting}
            showLabel={t('login.a11y.showPassword')}
            hideLabel={t('login.a11y.hidePassword')}
          />
          <Button
            title={t('nativeStart.signIn')}
            onPress={() => {
              void onSubmit();
            }}
            variant="filled"
            size="large"
            loading={submitting}
            disabled={!canSubmit}
            style={styles.submitButton}
          />
          {error ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>

        {showSocialSignIn && (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>{t('nativeStart.orContinueWith')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.buttons}>
              {showAppleSignIn && (
                // Apple's official native button — App Review requires it when other
                // third-party logins are offered. Self-labeled/localized; colour and
                // corner radius come from the dedicated props (not `style`).
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={
                    isDark
                      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={12}
                  style={styles.appleButton}
                  onPress={() => {
                    hapticLight();
                    void handleOAuthSignIn('apple');
                  }}
                />
              )}
              {/* Google's official brand-compliant button — only when the build
                  shipped the Google native config (otherwise it would fail on tap). */}
              {showGoogleSignIn && (
                <GoogleSigninButton
                  size={GoogleSigninButton.Size.Wide}
                  color={isDark ? GoogleSigninButton.Color.Dark : GoogleSigninButton.Color.Light}
                  disabled={oauthInProgress}
                  style={styles.googleButton}
                  onPress={() => {
                    hapticLight();
                    void handleOAuthSignIn('google');
                  }}
                />
              )}
            </View>
          </>
        )}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.systemColors.secondaryLabel }]}>
            {t('login.links.noAccount')}{' '}
          </Text>
          <Pressable
            onPress={() => {
              hapticLight();
              router.push('/auth/register');
            }}
            hitSlop={8}
            accessibilityRole="link"
          >
            <Text style={[styles.footerLink, { color: theme.systemColors.accent }]}>{t('login.submit.signUp')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 96, height: 96, marginBottom: 16 },
  title: { fontSize: 34, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 17 },
  form: { gap: 12 },
  submitButton: { alignSelf: 'stretch', marginTop: 4 },
  errorText: {
    color: '#FF3B30',
    fontSize: 15,
    marginTop: 4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60, 60, 67, 0.36)',
  },
  dividerLabel: {
    fontSize: 13,
    opacity: 0.6,
  },
  buttons: { gap: 12 },
  // Apple's native button needs explicit height + width or it renders nothing.
  appleButton: { width: '100%', height: 50 },
  googleButton: { width: '100%', height: 50 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: { fontSize: 15 },
  footerLink: { fontSize: 15, fontWeight: '600' },
});
