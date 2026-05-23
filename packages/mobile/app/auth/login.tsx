import { View, StyleSheet } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useAuth } from '../../src/providers/auth-provider';

export default function LoginScreen() {
  const { signIn } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="headlineLarge" style={styles.title}>
          Boardsesh
        </Text>
        <Text variant="bodyLarge" style={styles.subtitle}>
          One app for your boards
        </Text>
      </View>

      <View style={styles.buttons}>
        <Button mode="contained" onPress={() => signIn('google')} style={styles.button}>
          Sign in with Google
        </Button>
        <Button mode="contained" onPress={() => signIn('apple')} style={styles.button}>
          Sign in with Apple
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 48 },
  title: { fontWeight: '700', marginBottom: 8 },
  subtitle: { opacity: 0.7 },
  buttons: { gap: 12 },
  button: { borderRadius: 8 },
});
