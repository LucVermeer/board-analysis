import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { exchangeTransferToken } from '../../src/lib/auth';
import { brandColors } from '../../src/theme/colors';
import { useAuth } from '../../src/providers/auth-provider';

export default function AuthCallback() {
  const { transferToken } = useLocalSearchParams<{ transferToken: string }>();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refreshAuthState } = useAuth();
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (!transferToken) {
      setError('No transfer token received');
      return;
    }

    if (exchangedRef.current) return;
    exchangedRef.current = true;

    exchangeTransferToken(transferToken)
      .then(async (result) => {
        if (result.success) {
          await refreshAuthState();
          router.replace('/(tabs)/boards');
        } else {
          setError(result.error);
        }
      })
      .catch((exchangeError: unknown) => {
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
