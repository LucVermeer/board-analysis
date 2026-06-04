import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { exchangeTransferToken } from '../../src/lib/auth';
import { classifyNativeAuthFailureReason } from '../../src/lib/native-auth-analytics';
import { brandColors } from '../../src/theme/colors';
import { track } from '../../src/lib/analytics';
import { useAuth } from '../../src/providers/auth-provider';

export default function AuthCallback() {
  const { transferToken } = useLocalSearchParams<{ transferToken: string }>();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refreshAuthState } = useAuth();
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (!transferToken) {
      // auth_method is unknown here — the OAuth provider isn't echoed back on the
      // transfer-token exchange (same reason Login Succeeded omits it).
      track('Login Failed', { flow: 'native', failure_reason: 'no_transfer_token' });
      setError('No transfer token received');
      return;
    }

    if (exchangedRef.current) return;
    exchangedRef.current = true;

    exchangeTransferToken(transferToken)
      .then(async (result) => {
        if (result.success) {
          track('Login Succeeded', { flow: 'native' });
          await refreshAuthState();
          router.replace('/(tabs)/boards');
        } else {
          track('Login Failed', { flow: 'native', failure_reason: classifyNativeAuthFailureReason(result) });
          setError(result.error);
        }
      })
      .catch((exchangeError: unknown) => {
        track('Login Failed', { flow: 'native', failure_reason: 'exception' });
        setError(exchangeError instanceof Error ? exchangeError.message : 'Unexpected error');
      });
  }, [transferToken, router, refreshAuthState]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Sign in failed: {error}</Text>
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
  errorText: { fontSize: 16, color: brandColors.error, textAlign: 'center' },
});
