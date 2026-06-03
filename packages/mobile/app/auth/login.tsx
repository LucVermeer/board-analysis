import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as RNTextInput,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/providers/auth-provider';
import { useTheme } from '../../src/providers/theme-provider';
import { track } from '../../src/lib/analytics';
import { hapticLight } from '../../src/lib/haptics';
import { brandColors } from '../../src/theme/colors';
import { iosSystemColors } from '../../src/theme/ios-colors';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Minimal email regex — same shape as the web validator, intentionally lax
// so we don't reject anything the server would accept.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SignInButton({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        if (disabled) return;
        hapticLight();
        onPress();
      }}
      onPressIn={() => {
        if (disabled) return;
        scale.value = withSpring(0.97, { damping: 20, stiffness: 300, mass: 0.7 });
      }}
      onPressOut={() => {
        if (disabled) return;
        scale.value = withSpring(1, { damping: 20, stiffness: 300, mass: 0.7 });
      }}
      style={[animatedStyle, styles.button, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </AnimatedPressable>
  );
}

export default function LoginScreen() {
  const { signIn, signInWithCredentials } = useAuth();
  const { t } = useTranslation('auth');
  const theme = useTheme();
  const passwordRef = useRef<RNTextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    track('Login Attempted', { auth_method: 'credentials', flow: 'native' });
    try {
      const result = await signInWithCredentials(trimmedEmail, password);
      if (!result.success) {
        track('Login Failed', { auth_method: 'credentials', failure_reason: result.error });
        if (result.error === 'network') {
          setError(t('nativeStart.networkError'));
        } else if (result.status === 401) {
          setError(t('login.toasts.invalidCredentials'));
        } else {
          setError(result.error);
        }
      } else {
        track('Login Succeeded', { auth_method: 'credentials', flow: 'native' });
      }
      // On success, AuthProvider flips isAuthenticated and the redirect handles navigation.
    } catch (signInError) {
      track('Login Failed', {
        auth_method: 'credentials',
        failure_reason: signInError instanceof Error ? signInError.message : null,
      });
      throw signInError;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOAuthSignIn(provider: 'apple' | 'google') {
    track('Login Attempted', { auth_method: provider, flow: 'native' });
    const result = await signIn(provider);
    // A successful redirect ('success') hands off to /auth/callback, which fires
    // Login Succeeded/Failed. The user dismissing the system sheet is only
    // observable here — track it so the funnel sees the Attempted→Succeeded
    // drop-off instead of a silent gap.
    if (result.type === 'cancel' || result.type === 'dismiss') {
      track('Login Failed', { auth_method: provider, flow: 'native', failure_reason: result.type });
    }
  }

  // Input styling — dark-mode input fields are intentionally white (matches web).
  const isDark = theme.colorScheme === 'dark';
  const inputBackground = isDark ? iosSystemColors.white : '#FFFFFF';
  const inputBorder = isDark ? 'rgba(60, 60, 67, 0.36)' : 'rgba(60, 60, 67, 0.18)';
  const inputTextColor = '#000000';
  const inputPlaceholderColor = 'rgba(60, 60, 67, 0.6)';

  const inputStyle = [
    styles.input,
    { backgroundColor: inputBackground, borderColor: inputBorder, color: inputTextColor },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Boardsesh</Text>
          <Text style={styles.subtitle}>{t('nativeStart.tagline')}</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={inputStyle}
            value={email}
            onChangeText={setEmail}
            placeholder={t('login.placeholders.email')}
            placeholderTextColor={inputPlaceholderColor}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!submitting}
            accessibilityLabel={t('login.fields.email')}
          />
          <TextInput
            ref={passwordRef}
            style={inputStyle}
            value={password}
            onChangeText={setPassword}
            placeholder={t('login.placeholders.password')}
            placeholderTextColor={inputPlaceholderColor}
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
            accessibilityLabel={t('login.fields.password')}
          />
          <SignInButton
            title={submitting ? t('nativeStart.signingIn') : t('nativeStart.signIn')}
            onPress={() => {
              void onSubmit();
            }}
            disabled={!canSubmit}
          />
          {error ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>{t('nativeStart.orContinueWith')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.buttons}>
          {Platform.OS === 'ios' && (
            <SignInButton
              title={t('nativeStart.signInApple')}
              onPress={() => {
                void handleOAuthSignIn('apple');
              }}
            />
          )}
          <SignInButton
            title={t('nativeStart.signInGoogle')}
            onPress={() => {
              void handleOAuthSignIn('google');
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 34, fontWeight: '700', marginBottom: 8, color: brandColors.primary },
  subtitle: { fontSize: 17, opacity: 0.7 },
  form: { gap: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
  },
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
  button: {
    backgroundColor: brandColors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: iosSystemColors.white,
    fontSize: 17,
    fontWeight: '600',
  },
});
