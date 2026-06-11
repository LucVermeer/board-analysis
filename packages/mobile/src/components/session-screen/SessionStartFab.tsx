import { useCallback } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { FAB } from 'react-native-paper';
import { Button } from '../Button';
import { iconMap, type IconName } from '../icon-map';
import { useTheme } from '../../providers/theme-provider';
import { useBottomChromeMetrics } from '../../hooks/use-bottom-chrome-metrics';
import { spacing } from '../../theme/tokens';

type SessionStartFabProps = {
  /** Visible label — the Start copy (Material renders it as the extended FAB label;
   *  Liquid Glass as the floating capsule title). */
  label: string;
  /** Glyph for the Material extended FAB (maps to its Android icon). */
  materialIcon: IconName;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  /** Fires with the measured action height (excluding the bottom-chrome offset) so
   *  the host list reserves `measuredHeight + <offset>` and keeps its last row clear. */
  onHeightChange?: (height: number) => void;
};

/**
 * The session Start action, routed by UI variant. It is the screen's single
 * primary action, floated bottom-trailing with the scroll list running under it —
 * not a full-width pinned bar. Liquid Glass renders a brand-tinted prominent
 * capsule (the filled {@link Button}, whose `primaryFill` is the `glassProminent`
 * primary-action treatment); Material renders an M3 extended FAB. Both measure
 * their own height and report it through `onHeightChange`.
 *
 * The End action no longer lives here — it docks in the top chrome (see
 * `RecordTopChrome` / `SessionScreenHeader`), so the bottom edge keeps at most the
 * tab bar + climb accessory rather than stacking a third glass band.
 */
export function SessionStartFab({
  label,
  materialIcon,
  onPress,
  disabled,
  loading,
  testID,
  onHeightChange,
}: SessionStartFabProps) {
  const { variant } = useTheme();
  const bottomChrome = useBottomChromeMetrics();

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onHeightChange?.(event.nativeEvent.layout.height);
    },
    [onHeightChange],
  );

  // Both variants float the action in the screen's content area over the same
  // fixed-footer offset, which already clears any climb accessory and is
  // variant-correct: it includes the tab bar where it overlays content (the Liquid
  // Glass native tab bar) and excludes the in-flow Material nav bar. The host list
  // reserves `measuredHeight + fixedFooterBottom`, so the offset and the reservation
  // stay in lockstep on both variants (unlike `floatingControlBottom`, which is for
  // root-level overlays rendered over the tab bar, e.g. the queue snackbar).
  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      onLayout={onHeightChange ? handleLayout : undefined}
      style={[styles.container, { bottom: bottomChrome.fixedFooterBottom }]}
    >
      {variant === 'material' ? (
        <FAB
          icon={iconMap[materialIcon].android}
          label={label}
          onPress={onPress}
          disabled={disabled}
          loading={loading}
          variant="primary"
          mode="elevated"
        />
      ) : (
        <Button title={label} onPress={onPress} variant="filled" size="large" disabled={disabled} loading={loading} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Absolute + box-none so the list scrolls under it everywhere except the action
  // itself; bottom-trailing is the reachable one-handed corner for a deliberate commit.
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'flex-end',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
});
