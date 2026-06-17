import { memo, useContext } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BoardPresenceCurrentContext } from '@boardsesh/board-presence-react';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { spacing } from '../../theme/tokens';

/**
 * Status line shown in the play drawer when the displayed climb is the live wall
 * climb behind the accessory bar — a peer (or another climber on this board) is
 * driving the wall over BLE and this climb is physically lit right now.
 *
 * Unlike {@link PlayDrawerPreviewBanner}, this is *read-only* ambient status, not
 * a promotable preview, so it deliberately sits a tier quieter: no filled chip,
 * just a broadcast glyph + an amber footnote line. It speaks the same vocabulary
 * as the BoardSheet "Now on the wall" hero (amber accent + the holder's "Lit by
 * {name}" identity), so the drawer and the sheet read as one system.
 */
export const PlayDrawerOnWallBanner = memo(function PlayDrawerOnWallBanner() {
  const { t } = useTranslation('session');
  const { brandColors } = useTheme();

  // Read the presence context directly (non-throwing): gorhom portals the play
  // drawer to a modal host, so this can render outside the provider subtree —
  // degrade to the anonymous "On the wall" label instead of crashing, exactly as
  // BoardConnectionBadge does. The holder IS the sender, so identity comes from
  // the live current climb, falling back to the holder record for a late joiner.
  const current = useContext(BoardPresenceCurrentContext);
  const litByName = (current?.currentClimb?.sentByDisplayName ?? current?.holder?.displayName ?? null)?.trim() || null;
  const label = litByName ? t('mobile.boardPresence.litByLine', { name: litByName }) : t('playView.onWallBadge');

  return (
    <Animated.View entering={FadeIn.springify().damping(15).stiffness(200)} style={styles.row}>
      <Icon name="bluetooth.connected" size={13} color={brandColors.warning} />
      <Text variant="footnote" color={brandColors.warning} numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginHorizontal: spacing[4],
    marginTop: spacing[1],
    marginBottom: spacing[2],
  },
  label: {
    flexShrink: 1,
  },
});
