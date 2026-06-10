import { type ReactNode, useCallback } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GlassSurface } from './GlassSurface';
import { useTheme } from '../providers/theme-provider';
import { useNativeGlass } from '../hooks/use-native-glass';
import { useBottomChromeMetrics } from '../hooks/use-bottom-chrome-metrics';
import { spacing } from '../theme/tokens';

type PinnedActionBarProps = {
  /** The action button(s) to pin. */
  children: ReactNode;
  /** Fires with the measured bar height (excluding the bottom-chrome offset) so
   *  the host list can reserve `measuredHeight + fixedFooterBottom` of bottom
   *  padding and keep its last row clear of the bar. */
  onHeightChange?: (height: number) => void;
  /** testID forwarded to the bar's outer view (footer-positioning assertions). */
  testID?: string;
};

/**
 * A glass toolbar pinned above the bottom chrome (tab bar / queue accessory),
 * with the scrollable content running under it. Extracted from the pre- and
 * in-session footers, which had hand-rolled identical copies; centralising it
 * also fixes the bug where the host reserved a hardcoded clearance instead of
 * the bar's real height.
 *
 * The bar reads `fixedFooterBottom` from `useBottomChromeMetrics()` itself, so
 * it sits flush over the tab bar when the queue accessory is absent and lifts to
 * clear the accessory when present. It measures its own height via `onLayout`
 * and reports it through `onHeightChange`; the host adds `fixedFooterBottom` to
 * derive the total bottom inset.
 */
export function PinnedActionBar({ children, onHeightChange, testID }: PinnedActionBarProps) {
  const { systemColors } = useTheme();
  const nativeGlass = useNativeGlass();
  const bottomChrome = useBottomChromeMetrics();
  const footerBottom = bottomChrome.fixedFooterBottom;

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onHeightChange?.(event.nativeEvent.layout.height);
    },
    [onHeightChange],
  );

  return (
    <View
      testID={testID}
      onLayout={onHeightChange ? handleLayout : undefined}
      style={[
        styles.bar,
        { bottom: footerBottom },
        !nativeGlass && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: systemColors.separator },
      ]}
    >
      <GlassSurface
        glassEffectStyle="regular"
        fallbackColor={systemColors.background}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // A glass toolbar pinned flush above the tab bar; the list scrolls under it.
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    overflow: 'hidden',
  },
});
