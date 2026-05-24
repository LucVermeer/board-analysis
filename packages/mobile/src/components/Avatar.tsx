import { View, Image, StyleSheet } from 'react-native';
import { Text } from './Text';
import { getInitials } from '../lib/get-initials';
import { brandColors } from '../theme/colors';
import { iosSystemColors, neutralGray } from '../theme/ios-colors';

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const borderRadius = size / 2;

  const accessibilityLabel = name ?? undefined;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityLabel={accessibilityLabel}
        style={[styles.image, { width: size, height: size, borderRadius }]}
      />
    );
  }

  const initials = name ? getInitials(name) : '?';
  const fontSize = size * 0.4;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.fallback, { width: size, height: size, borderRadius }]}
    >
      <Text variant="caption1" color={iosSystemColors.white} style={{ fontSize, fontWeight: '600' }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: neutralGray,
  },
  fallback: {
    backgroundColor: brandColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
