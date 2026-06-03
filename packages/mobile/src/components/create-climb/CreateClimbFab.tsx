import { Pressable, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon';
import { hapticLight } from '../../lib/haptics';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';
import { BAR_CONTENT_HEIGHT, TAB_BAR_HEIGHT } from '../../theme/layout';

/**
 * Floating "create a climb" button on the climbs list. Anchored bottom-right
 * and lifted above the persistent queue bar + tab bar (mirrors
 * CreatePlaylistFab). The parent gates rendering on auth + an active board.
 */
export function CreateClimbFab({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('climbs');
  const insets = useSafeAreaInsets();
  const bottom = BAR_CONTENT_HEIGHT + TAB_BAR_HEIGHT + insets.bottom + spacing[3];

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('mobile.create.fab.ariaLabel')}
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
