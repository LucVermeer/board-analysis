/**
 * PersistentQueueBar — the floating climb toolbar that mounts at the app root
 * and is visible on every screen while a current climb is set.
 *
 * Three separate glass islands sharing one row (iOS-Photos style), no opaque
 * card:
 *   [ search gutter ]   [ grade · climb name ]   [ ✓ log ascent ]
 *     ↑ empty here;        ↑ tap = PlayDrawer        ↑ tints green
 *       the Climbs tab       swipe = prev/next          when logged,
 *       drops its search                                 pops on a send
 *       FAB into this slot
 *
 * The capsule + tick are global; the search FAB lives in the Climbs screen and
 * floats into the reserved left gutter at the same bottom. When that search
 * expands it grows across the row, so the capsule + tick fade out of the way
 * (driven by the cross-tree `useSearchExpanded` signal).
 */

import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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
  glassSize,
} from '../../theme/layout';
import { useQueue } from '../../providers/queue-provider';
import { useReduceMotion } from '../../hooks/use-reduce-motion';
import { useSearchExpanded } from '../../lib/search-expanded-state';
import { TAB_BAR_HEIGHT } from '../BlurTabBar';
import { ClimbCapsule } from './ClimbCapsule';
import { LogAscentFab } from './LogAscentFab';

// Re-export so layout consumers that already import toolbar metrics from this
// module don't need to know which file owns them. Source of truth: theme/layout.
export { TOOLBAR_RESERVE, TAB_BAR_HEIGHT };

export function PersistentQueueBar() {
  const { state } = useQueue();
  const insets = useSafeAreaInsets();
  const searchExpanded = useSearchExpanded();
  const reduceMotion = useReduceMotion();

  const currentClimb = state.currentClimbQueueItem?.climb;
  // The tick (log-ascent) is a climb-browsing action — show it only on the Climbs
  // tab. The capsule itself stays global so the current climb is visible anywhere.
  const onClimbsTab = isClimbsTabRoute(useSegments());

  // Yield the row to the Climbs-tab search when it expands: fade the capsule +
  // tick out (they stay mounted — they're global — just transparent and inert).
  const fade = useSharedValue(searchExpanded ? 0 : 1);
  useEffect(() => {
    const target = searchExpanded ? 0 : 1;
    fade.value = reduceMotion ? target : withTiming(target, { duration: timing.fast });
  }, [searchExpanded, reduceMotion, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!currentClimb) return null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(timing.normal)}
      pointerEvents="box-none"
      style={[styles.toolbar, { bottom: insets.bottom + TAB_BAR_HEIGHT + TOOLBAR_GAP_ABOVE_TABBAR }]}
    >
      <Animated.View
        style={[styles.row, fadeStyle]}
        pointerEvents={searchExpanded ? 'none' : 'box-none'}
        importantForAccessibility={searchExpanded ? 'no-hide-descendants' : 'auto'}
      >
        {/* Reserved left gutter. The Climbs tab drops its search FAB here (a
            separate mount); elsewhere it stays empty so the capsule centers.
            `none` so it never blocks taps on the search FAB beneath it. */}
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
  // Left gutter: reserves room for the Climbs-tab search FAB (standard size) so
  // the capsule never centers under where it floats in.
  sideSlot: {
    width: TOOLBAR_FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Right slot holds the hero log-ascent FAB — a touch larger than the search
  // gutter, which gives the row its deliberate, playful asymmetry.
  heroSlot: {
    width: glassSize.hero,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
