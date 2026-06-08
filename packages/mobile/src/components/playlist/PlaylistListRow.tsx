import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { PressableSurface } from '../PressableSurface';
import { useTheme } from '../../providers/theme-provider';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';
import { hapticLight } from '../../lib/haptics';
import { PlaylistPreviewSquare } from './PlaylistPreviewSquare';

const THUMB_SIZE = 44;

export type PlaylistListRowProps = {
  name: string;
  climbCount: number;
  color?: string;
  icon?: string;
  /** Index into the preview's fallback colour palette. */
  index?: number;
  onPress: () => void;
  /** Hide the bottom hairline on the last row. */
  showSeparator?: boolean;
};

/**
 * A scannable vertical playlist row for the "My Playlists" list: a small
 * preview thumbnail, the name, its climb count, and a disclosure chevron. Unlike
 * the generic `ListRow` (32px leading), this sizes the thumbnail to read clearly
 * in a dense alphabetical list.
 */
export function PlaylistListRow({
  name,
  climbCount,
  color,
  icon,
  index = 0,
  onPress,
  showSeparator = true,
}: PlaylistListRowProps) {
  const { t } = useTranslation('playlists');
  const { systemColors } = useTheme();

  const countLabel = t('detail.climbCount', { count: climbCount });

  const handlePress = useCallback(() => {
    hapticLight();
    onPress();
  }, [onPress]);

  return (
    <PressableSurface
      onPress={handlePress}
      feedback="opacity"
      opacityTo={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${countLabel}`}
    >
      <View style={styles.row}>
        <PlaylistPreviewSquare color={color} icon={icon} index={index} size={THUMB_SIZE} />
        <View style={styles.info}>
          <Text variant="body" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Text variant="subheadline" numberOfLines={1} style={styles.meta}>
            {countLabel}
          </Text>
        </View>
        <Icon name="chevron.right" size={14} color={iosSystemColors.systemGray4} />
      </View>
      {showSeparator ? <View style={[styles.separator, { backgroundColor: systemColors.separator }]} /> : null}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    minHeight: 60,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontWeight: '600',
  },
  meta: {
    opacity: 0.6,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing[4] + THUMB_SIZE + spacing[3],
  },
});
