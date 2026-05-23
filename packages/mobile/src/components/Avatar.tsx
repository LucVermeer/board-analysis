import { View, Image, StyleSheet } from 'react-native';
import { Text } from './Text';

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const borderRadius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, { width: size, height: size, borderRadius }]}
      />
    );
  }

  const initials = name ? getInitials(name) : '?';
  const fontSize = size * 0.4;

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius }]}>
      <Text variant="caption1" color="#FFFFFF" style={{ fontSize, fontWeight: '600' }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#E5E7EB',
  },
  fallback: {
    backgroundColor: '#8C4A52',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
