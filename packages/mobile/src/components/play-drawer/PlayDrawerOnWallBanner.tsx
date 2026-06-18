import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BoardDriverAvatar } from '../board-presence/BoardDriverAvatar';
import { useBoardDriver } from '../board-presence/use-board-driver';

/** Avatar diameter for the on-wall driver in the drawer header's leading slot. */
const DRIVER_AVATAR_SIZE = 24;

/**
 * Shown in the play drawer when the displayed climb is the live wall climb behind
 * the accessory bar — a peer (or another climber on this board) is driving the
 * wall over BLE and this climb is physically lit right now.
 *
 * Reads as ambient status, not a promotable preview: just the driver's avatar
 * with an amber Bluetooth badge in the corner. The avatar opens the driver's
 * profile on tap (degrading to a non-interactive "?" for an anonymous holder),
 * and the name the old "Lit by {name}" line carried now rides in the
 * accessibility label so screen readers keep parity.
 *
 * Renders inline in the DrawerHeader's leading slot — to the left of the climb
 * name, opposite the grade — so it reads as chrome in the corner rather than a
 * banner pushing the board down. The header supplies the row padding, so this
 * component carries no outer margins. The banner owns the driver's face while
 * it's up; the lightbulb pip is suppressed (see PlayDrawer / PlayDrawerActionBar)
 * so the same face never appears twice.
 */
export const PlayDrawerOnWallBanner = memo(function PlayDrawerOnWallBanner() {
  const { t } = useTranslation('session');
  const driver = useBoardDriver();
  const name = driver?.displayName?.trim() || null;
  const accessibilityLabel = name
    ? t('mobile.boardPresence.drivenByA11y', { name })
    : t('mobile.boardPresence.drivenByAnonA11y');

  return (
    <Animated.View entering={FadeIn.springify().damping(15).stiffness(200)} style={styles.row}>
      <BoardDriverAvatar
        size={DRIVER_AVATAR_SIZE}
        userId={driver?.userId ?? null}
        uri={driver?.avatarUrl ?? null}
        name={name}
        status={driver?.isIdle ? 'idle' : 'connected'}
        accessibilityLabel={accessibilityLabel}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // Margin-free: this renders inline in the DrawerHeader leading slot, which
  // supplies the row's padding/gap. The grade sits in the trailing slot opposite.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
