import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { exchangeTransferToken } from '../../src/lib/auth';
import { classifyNativeAuthFailureReason } from '../../src/lib/native-auth-analytics';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { track } from '../../src/lib/analytics';
import { useAuth } from '../../src/providers/auth-provider';
import { useTheme } from '../../src/providers/theme-provider';

// Transfer tokens are one-time use, and this screen can mount twice for the
// same token: on Android the callback deep link is routed by expo-router AND
// the login screen routes here explicitly with the URL openAuthSessionAsync
// returned. Module-level so a remount can't replay (and fail) the exchange —
// the duplicate mount just shows the spinner until AuthProvider redirects.
const exchangedTokens = new Set<string>();

export default function AuthCallback() {
  const { transferToken } = useLocalSearchParams<{ transferToken: string }>();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refreshAuthState } = useAuth();
  const theme = useTheme();

  useEffect(() => {
    if (!transferToken) {
      // auth_method is unknown here — the OAuth provider isn't echoed back on the
      // transfer-token exchange (same reason Login Succeeded omits it).
      track(SHARED_EVENTS.LoginFailed, { flow: 'native', failure_reason: 'no_transfer_token' });
      setError('No transfer token received');
      return;
    }

    if (exchangedTokens.has(transferToken)) return;
    exchangedTokens.add(transferToken);

    exchangeTransferToken(transferToken)
      .then(async (result) => {
        if (result.success) {
          track(SHARED_EVENTS.LoginSucceeded, { flow: 'native' });
          await refreshAuthState();
          router.replace('/(tabs)/climbs');
        } else {
          track(SHARED_EVENTS.LoginFailed, { flow: 'native', failure_reason: classifyNativeAuthFailureReason(result) });
          setError(result.error);
        }
      })
      .catch((exchangeError: unknown) => {
        track(SHARED_EVENTS.LoginFailed, { flow: 'native', failure_reason: 'exception' });
        setError(exchangeError instanceof Error ? exchangeError.message : 'Unexpected error');
      });
  }, [transferToken, router, refreshAuthState]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={[styles.errorText, { color: theme.brandColors.error }]}>Sign in failed: {error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.text}>Signing in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  text: { marginTop: 16, fontSize: 16 },
  errorText: { fontSize: 16, textAlign: 'center' },
});
