import { useMemo } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { iosSystemColors } from '../../theme/ios-colors';
import { borderRadius } from '../../theme/tokens';

// Cycling fallback palette mirroring web's `PLAYLIST_COLORS`
// (playlist-preview-square.tsx). Used when a playlist has no valid `color`.
const PLAYLIST_COLORS = [
  '#8C4A52', // primary
  '#5fb27a', // accentGreen
  '#9C27B0', // purple
  '#C4943C', // warning
  '#EC4899', // pink
  '#6B9080', // success
  '#d65a4f', // accentRose
  '#FBBF24', // amber
];

const HEX_PATTERN = /^#([0-9A-Fa-f]{3}){1,2}$/;

function isValidHexColor(color: string): boolean {
  return HEX_PATTERN.test(color);
}

export type PlaylistPreviewSquareProps = {
  /** Playlist colour (hex). Falls back to a cycling palette colour. */
  color?: string;
  /** Emoji rendered centered. Falls back to a generic tag glyph. */
  icon?: string;
  /** Index into the fallback palette (so a list of cards cycles colours). */
  index?: number;
  /** Square edge length in px. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Square playlist thumbnail: a colour-tinted background with a centered emoji.
 * Board-background imagery is intentionally out of scope on mobile (web renders
 * a frosted board preview behind the tint); this keeps the tile cheap to render
 * inside FlashList rows and horizontal scrollers.
 */
export function PlaylistPreviewSquare({ color, icon, index = 0, size = 64, style }: PlaylistPreviewSquareProps) {
  const backgroundColor = useMemo(() => {
    if (color && isValidHexColor(color)) return color;
    return PLAYLIST_COLORS[index % PLAYLIST_COLORS.length];
  }, [color, index]);

  // Scale the centred glyph with the tile so the 96px hero and the 64px card
  // both read well.
  const emojiSize = Math.round(size * 0.42);
  const iconSize = Math.round(size * 0.38);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor, width: size, height: size, borderRadius: size >= 80 ? borderRadius.xl : borderRadius.lg },
        style,
      ]}
    >
      {/* Soft top-left highlight, mirroring web's diagonal white gradient. */}
      <View style={styles.highlight} pointerEvents="none" />
      {icon ? (
        <Text
          style={[styles.emoji, { fontSize: emojiSize, lineHeight: Math.round(emojiSize * 1.3) }]}
          allowFontScaling={false}
        >
          {icon}
        </Text>
      ) : (
        <Icon name="tag" size={iconSize} color={iosSystemColors.white} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  highlight: {
    // A faux diagonal highlight: a translucent layer anchored to the top-left
    // corner (web renders a 135deg white gradient; this approximates it).
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: '45%',
    right: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  emoji: {
    textAlign: 'center',
  },
});
