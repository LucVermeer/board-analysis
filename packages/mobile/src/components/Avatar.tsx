import { View, Image, StyleSheet, PixelRatio } from 'react-native';
import { Text } from './Text';
import { getInitials } from '../lib/get-initials';
import { brandColors } from '../theme/colors';
import { iosSystemColors, neutralGray } from '../theme/ios-colors';

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

/**
 * Mirror of the backend's `ALLOWED_IMAGE_SIZES`
 * (packages/backend/src/lib/image-resize.ts). A `?size=` value outside this
 * set makes the backend serve the full-size original, so snap to the
 * smallest bucket that covers the display size at the device pixel ratio.
 */
const AVATAR_SIZE_BUCKETS = [44, 64, 80, 128, 140, 280] as const;

/**
 * Request a pre-sized variant for backend-served avatars so the device
 * fetches a small image instead of the full user upload (which can be
 * multiple megapixels). Third-party avatar URLs are passed through — the
 * backend can only resize what it stores.
 */
function sizedAvatarUri(uri: string, displaySize: number): string {
  if (!uri.includes('/static/avatars/')) return uri;
  const target = Math.ceil(displaySize * PixelRatio.get());
  const bucket =
    AVATAR_SIZE_BUCKETS.find((candidate) => candidate >= target) ?? AVATAR_SIZE_BUCKETS[AVATAR_SIZE_BUCKETS.length - 1];
  const separator = uri.includes('?') ? '&' : '?';
  return `${uri}${separator}size=${bucket}`;
}

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const borderRadius = size / 2;

  const accessibilityLabel = name ?? undefined;

  if (uri) {
    return (
      <Image
        source={{ uri: sizedAvatarUri(uri, size) }}
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
      {/* Override lineHeight too: the caption1 variant pins it to 16, which is
          smaller than fontSize once size > 40 and clips the top of the
          initials. Match it to fontSize so the glyph's line box fits. */}
      <Text
        variant="caption1"
        color={iosSystemColors.white}
        style={{ fontSize, lineHeight: fontSize, fontWeight: '600' }}
      >
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
