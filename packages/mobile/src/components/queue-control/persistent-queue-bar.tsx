/**
 * PersistentQueueBar — the floating climb toolbar that mounts at the app root
 * and is visible on every screen while a current climb is set.
 *
 * Just the global climb capsule now, floating above the tab bar (iOS-Photos
 * style, no opaque card):
 *   [ grade · climb name ]            [ ✓ tick ]
 *     ↑ tap = PlayDrawer                ↑ Climbs tab only, when the native
 *       swipe = prev/next                 bottom accessory is unavailable
 *
 * The native iOS 26 bottom accessory owns this same current climb + tick pair.
 * On that path this JS fallback returns null so the tab bar minimization behavior
 * comes from UIKit.
 */

import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import { isClimbsTabRoute } from '../../lib/route-segments';
import { timing } from '../../theme/animations';
import {
  TOOLBAR_RESERVE,
  TOOLBAR_SIDE_MARGIN,
  TOOLBAR_GAP,
  TOOLBAR_FAB_SIZE,
  TOOLBAR_GAP_ABOVE_TABBAR,
  TAB_BAR_HEIGHT,
  glassSize,
} from '../../theme/layout';
import { useQueue } from '../../providers/queue-provider';
import { useReduceMotion } from '../../hooks/use-reduce-motion';
import { isBottomAccessoryAvailable } from '../../hooks/use-bottom-accessory';
import { ClimbCapsule } from './ClimbCapsule';
import { LogAscentFab } from './LogAscentFab';

// Re-export so layout consumers that already import toolbar metrics from this
// module don't need to know which file owns them. Source of truth: theme/layout.
export { TOOLBAR_RESERVE, TAB_BAR_HEIGHT };

export function PersistentQueueBar() {
  const { state } = useQueue();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const currentClimb = state.currentClimbQueueItem?.climb;
  const onClimbsTab = isClimbsTabRoute(useSegments());

  if (isBottomAccessoryAvailable()) return null;
  if (!currentClimb) return null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(timing.normal)}
      pointerEvents="box-none"
      style={[styles.toolbar, { bottom: insets.bottom + TAB_BAR_HEIGHT + TOOLBAR_GAP_ABOVE_TABBAR }]}
    >
      <Animated.View style={styles.row} pointerEvents="box-none" importantForAccessibility="auto">
        <View style={styles.sideSlot} pointerEvents="none" />
        <View style={styles.centerSlot} pointerEvents="box-none">
          <ClimbCapsule />
        </View>
        <View style={styles.heroSlot} pointerEvents="box-none">
          {onClimbsTab ? <LogAscentFab climb={currentClimb} /> : null}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    position: 'absolute',
    left: TOOLBAR_SIDE_MARGIN,
    right: TOOLBAR_SIDE_MARGIN,
    // `bottom` is set inline from the safe-area inset + tab-bar height so the
    // islands float just above the tab bar.
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TOOLBAR_GAP,
  },
  centerSlot: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Sticky-strip / non-Climbs left gutter: balances the capsule so it reads
  // centered between the edge and the standalone tick.
  sideSlot: {
    width: TOOLBAR_FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sticky-strip standalone log-ascent tick (hero size) on the Climbs tab.
  heroSlot: {
    width: glassSize.hero,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
