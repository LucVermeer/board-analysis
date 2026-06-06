import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GlassIconButton } from '../GlassIconButton';
import { useTheme } from '../../providers/theme-provider';
import { hapticLight } from '../../lib/haptics';
import { spacing } from '../../theme/tokens';
import { glassSize } from '../../theme/layout';
import { useBottomChromeMetrics } from '../../hooks/use-bottom-chrome-metrics';

/**
 * Floating "create playlist" button on the Discover library — the single defining
 * action of that screen, so it takes the glass `hero` size. The playlist hero
 * cards behind it are bright, vivid colours, so the plus glyph uses the
 * high-contrast system `label` (black on light, white on dark) to stay legible
 * over any card — colour on the icon, not a fill, on the OS-standard `regular`
 * glass. Anchored bottom-right, lifted above the persistent queue bar + tab bar
 * so it never sits under them. The parent gates rendering on auth.
 */
export function CreatePlaylistFab({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('playlists');
  const { systemColors } = useTheme();
  const bottomChrome = useBottomChromeMetrics();
  const bottom = bottomChrome.floatingControlBottom + spacing[3];

  return (
    <View style={[styles.fab, { bottom }]}>
      <GlassIconButton
        iconName="plus"
        iconColor={systemColors.label as string}
        iconSize={28}
        size={glassSize.hero}
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
