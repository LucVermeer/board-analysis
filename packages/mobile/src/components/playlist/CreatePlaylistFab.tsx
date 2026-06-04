import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { GlassIconButton } from '../GlassIconButton';
import { useTheme } from '../../providers/theme-provider';
import { hapticLight } from '../../lib/haptics';
import { spacing, glassMaterial } from '../../theme/tokens';
import { glassSize } from '../../theme/layout';
import { TOOLBAR_RESERVE, TAB_BAR_HEIGHT } from '../queue-control/persistent-queue-bar';

/**
 * Floating "create playlist" button on the Discover library — the single defining
 * action of that screen, so it takes the glass `hero` size. The playlist hero
 * cards behind it are bright, vivid colours, so legibility gets two levers: a
 * high-contrast `label` plus glyph (black on light, white on dark) and the
 * `thick` glass material, which frosts the saturated card behind it instead of
 * letting the colour bleed through. Anchored bottom-right, lifted above the
 * persistent queue bar + tab bar so it never sits under them. The parent gates
 * rendering on auth.
 */
export function CreatePlaylistFab({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('playlists');
  const { systemColors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = TOOLBAR_RESERVE + TAB_BAR_HEIGHT + insets.bottom + spacing[3];

  return (
    <View style={[styles.fab, { bottom }]}>
      <GlassIconButton
        iconName="plus"
        iconColor={systemColors.label as string}
        iconSize={28}
        size={glassSize.hero}
        blurAmount={glassMaterial.thick}
        onPress={() => {
          hapticLight();
          onPress();
        }}
        accessibilityLabel={t('library.createFab.ariaLabel')}
        fallbackColor={systemColors.fill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing[4],
  },
});
