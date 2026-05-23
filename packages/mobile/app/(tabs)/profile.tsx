import { View, StyleSheet } from 'react-native';
import { Text, Button, Avatar, ActivityIndicator } from 'react-native-paper';
import { useProfile } from '../../src/lib/graphql/hooks';
import { useAuth } from '../../src/providers/auth-provider';

export default function Profile() {
  const { data: profile, isLoading } = useProfile();
  const { signOut } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {profile?.avatarUrl ? (
          <Avatar.Image size={80} source={{ uri: profile.avatarUrl }} />
        ) : (
          <Avatar.Icon size={80} icon="account" />
        )}
        <Text variant="headlineSmall" style={styles.name}>
          {profile?.displayName ?? 'Unknown'}
        </Text>
        <Text variant="bodyMedium" style={styles.email}>
          {profile?.email ?? ''}
        </Text>
      </View>

      <Button mode="outlined" onPress={signOut} style={styles.signOutButton}>
        Sign out
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', marginTop: 48, marginBottom: 32 },
  name: { marginTop: 16, fontWeight: '600' },
  email: { marginTop: 4, opacity: 0.6 },
  signOutButton: { marginTop: 'auto', marginBottom: 32 },
});
