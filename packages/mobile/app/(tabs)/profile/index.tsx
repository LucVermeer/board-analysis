import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { useProfile } from '../../../src/lib/graphql/hooks';
import { useAuth } from '../../../src/providers/auth-provider';

export default function Profile() {
  const { data: profile, isLoading } = useProfile();
  const { signOut } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const textColor = isDark ? '#FFFFFF' : '#000000';
  const subtitleColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
  const buttonBorder = isDark ? '#38383A' : '#C6C6C8';
  const avatarBackground = isDark ? '#2C2C2E' : '#E5E5EA';

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
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: avatarBackground }]}>
            <Text style={[styles.avatarInitial, { color: subtitleColor }]}>
              {profile?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        <Text style={[styles.name, { color: textColor }]}>
          {profile?.displayName ?? 'Unknown'}
        </Text>
        <Text style={[styles.email, { color: subtitleColor }]}>{profile?.email ?? ''}</Text>
      </View>

      <Pressable
        style={[styles.signOutButton, { borderColor: buttonBorder }]}
        onPress={signOut}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: '600',
  },
  name: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '600',
  },
  email: {
    marginTop: 4,
    fontSize: 15,
  },
  signOutButton: {
    marginTop: 'auto',
    marginBottom: 32,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  signOutText: {
    fontSize: 17,
    color: '#FF3B30',
  },
});
