/**
 * ActiveContextBar — the content-agnostic floating bar that sits above the tab
 * bar. It owns ONLY the layout (absolute lift above the tab bar, the
 * leading / primary / trailing slot rhythm, fade-in) — not what fills it. Today
 * the primary slot holds the climb capsule; a later workout rep-timer drops into
 * the same slot with no changes here.
 *
 *   [ leading ]      [        primary        ]      [ trailing ]
 *     gutter/widget     climb capsule / timer         hero action (tick)
 *
 * Visibility is the caller's call (it knows whether there's a climb / timer to
 * show); this component only positions whatever it's given.
 */

import { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { timing } from '../../theme/animations';
import {
  TOOLBAR_SIDE_MARGIN,
  TOOLBAR_GAP,
  TOOLBAR_FAB_SIZE,
  TOOLBAR_GAP_ABOVE_TABBAR,
  glassSize,
} from '../../theme/layout';
import { useReduceMotion } from '../../hooks/use-reduce-motion';
import { useBottomChromeMetrics } from '../../hooks/use-bottom-chrome-metrics';

type ActiveContextBarProps = {
  /** Optional leading widget; defaults to an empty gutter that balances the bar. */
  leading?: ReactNode;
  /** The main occupant (climb capsule today, timer later). */
  primary: ReactNode;
  /** Optional trailing hero action (e.g. the log-ascent tick). */
  trailing?: ReactNode;
  /** Width of the trailing slot (defaults to the hero size). */
  trailingWidth?: number;
  /** Render the primary edge-to-edge (no leading/trailing slots) — the Material
   *  full-width bar, where the trailing action lives inside the primary. */
  fillPrimary?: boolean;
  /** Lift above the tab bar (defaults to TOOLBAR_GAP_ABOVE_TABBAR). */
  gapAboveTabBar?: number;
};

export function ActiveContextBar({
  leading,
  primary,
  trailing,
  trailingWidth = glassSize.hero,
  fillPrimary = false,
  gapAboveTabBar = TOOLBAR_GAP_ABOVE_TABBAR,
}: ActiveContextBarProps) {
  const reduceMotion = useReduceMotion();
  const bottomChrome = useBottomChromeMetrics();

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(timing.normal)}
      pointerEvents="box-none"
      style={[styles.toolbar, { bottom: bottomChrome.tabBarBottom + gapAboveTabBar }]}
    >
      {fillPrimary ? (
        <View style={styles.fillRow} pointerEvents="box-none" importantForAccessibility="auto">
          {primary}
        </View>
      ) : (
        <Animated.View style={styles.row} pointerEvents="box-none" importantForAccessibility="auto">
          <View style={styles.sideSlot} pointerEvents={leading ? 'box-none' : 'none'}>
            {leading}
          </View>
          <View style={styles.centerSlot} pointerEvents="box-none">
            {primary}
          </View>
          <View style={[styles.heroSlot, { width: trailingWidth }]} pointerEvents="box-none">
            {trailing}
          </View>
        </Animated.View>
      )}
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
  // Full-width primary (Material bar): the single occupant spans the toolbar.
  fillRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centerSlot: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Left gutter: balances the primary slot so it reads centered between the
  // screen edge and the trailing action.
  sideSlot: {
    width: TOOLBAR_FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
