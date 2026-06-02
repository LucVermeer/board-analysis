import { useCallback } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { hapticLight } from '../../lib/haptics';
import { spacing } from '../../theme/tokens';
import { PlaylistPreviewSquare } from './PlaylistPreviewSquare';

// Tile edge lengths per variant. Grid cards sit two-up in the smart/pinned
// sections; scroll cards are larger and live in horizontal scrollers.
const GRID_SQUARE = 64;
const SCROLL_SQUARE = 120;

export type PlaylistCardProps = {
  name: string;
  climbCount: number;
  color?: string;
  icon?: string;
  /** `grid` = compact 2-up tile; `scroll` = larger horizontal-scroller card. */
  variant: 'grid' | 'scroll';
  /** Index into the preview's fallback colour palette. */
  index?: number;
  onPress: () => void;
};

export function PlaylistCard({ name, climbCount, color, icon, variant, index = 0, onPress }: PlaylistCardProps) {
  const { t } = useTranslation('playlists');

  const handlePress = useCallback(() => {
    hapticLight();
    onPress();
  }, [onPress]);

  const isScroll = variant === 'scroll';
  const squareSize = isScroll ? SCROLL_SQUARE : GRID_SQUARE;
  const countLabel = t('detail.climbCount', { count: climbCount });

  if (isScroll) {
    return (
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${countLabel}`}
        style={[styles.scrollCard, { width: SCROLL_SQUARE }]}
      >
        <PlaylistPreviewSquare color={color} icon={icon} index={index} size={squareSize} />
        <Text variant="subheadline" numberOfLines={1} style={styles.scrollName}>
          {name}
        </Text>
        <Text variant="caption1" numberOfLines={1} style={styles.meta}>
          {countLabel}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${countLabel}`}
      style={styles.gridCard}
    >
      <PlaylistPreviewSquare color={color} icon={icon} index={index} size={squareSize} />
      <View style={styles.gridInfo}>
        <Text variant="subheadline" numberOfLines={1} style={styles.gridName}>
          {name}
        </Text>
        <Text variant="caption1" numberOfLines={1} style={styles.meta}>
          {countLabel}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gridCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  gridInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  gridName: {
    fontWeight: '600',
  },
  scrollCard: {
    gap: spacing[2],
  },
  scrollName: {
    fontWeight: '600',
  },
  meta: {
    opacity: 0.6,
  },
});
