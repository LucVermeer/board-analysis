import { Pressable, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon';
import { hapticLight } from '../../lib/haptics';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';
import { BAR_CONTENT_HEIGHT, TAB_BAR_HEIGHT } from '../queue-control/persistent-queue-bar';

/**
 * Floating "create playlist" button on the Discover library (mirrors web's
 * `Fab`). Anchored bottom-right, lifted above the persistent queue bar + tab
 * bar so it never sits under them. The parent gates rendering on auth.
 */
export function CreatePlaylistFab({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('playlists');
  const insets = useSafeAreaInsets();
  const bottom = BAR_CONTENT_HEIGHT + TAB_BAR_HEIGHT + insets.bottom + spacing[3];

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('library.createFab.ariaLabel')}
      style={({ pressed }) => [styles.fab, { bottom }, pressed && styles.pressed]}
    >
      <Icon name="plus" size={28} color={iosSystemColors.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing[4],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: brandColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  pressed: {
    opacity: 0.85,
  },
});
