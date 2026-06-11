import { useCallback } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FAB } from 'react-native-paper';
import { GlassSurface } from '../GlassSurface';
import { PressableSurface } from '../PressableSurface';
import { Icon } from '../Icon';
import { Text } from '../Text';
import { iconMap, type IconName } from '../icon-map';
import { useTheme } from '../../providers/theme-provider';
import { useNativeGlass } from '../../hooks/use-native-glass';
import { useBottomChromeMetrics } from '../../hooks/use-bottom-chrome-metrics';
import { hapticLight } from '../../lib/haptics';
import { spacing, shadows } from '../../theme/tokens';

const CAPSULE_HEIGHT = 52;
const CAPSULE_RADIUS = CAPSULE_HEIGHT / 2;

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
   *  the host list reserves `measuredHeight + fixedFooterBottom` and keeps its last
   *  row clear. */
  onHeightChange?: (height: number) => void;
};

/**
 * The session Start action, routed by UI variant. It is the screen's single
 * primary action, floated bottom-trailing with the scroll list running under it —
 * not a full-width pinned bar. Liquid Glass renders a brand-tinted **glass**
 * capsule (the iOS 26 `.glassProminent` look: a `GlassSurface` tinted with the
 * brand hue, not a flat opaque fill); Material renders an M3 extended FAB. Both
 * sit over `fixedFooterBottom`, which hugs the tab bar when no climb accessory is
 * present and lifts to clear it when there is one, and report their height through
 * `onHeightChange`.
 *
 * The End action no longer lives here — it docks in the top chrome (see
 * `RecordTopChrome` / `SessionScreenHeader`).
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
  const insets = useSafeAreaInsets();
  // The Liquid Glass NativeTabs + BottomAccessory already inflate the safe-area
  // bottom inset to include the tab bar AND the accessory, so the capsule anchors to
  // that raw inset — everything below it is system chrome. (`fixedFooterBottom` adds
  // the tab bar + accessory a second time, which strands the capsule mid-screen.)
  // Only the Material variant — in-flow tab bar + a JS queue bar that isn't in the
  // safe-area inset — needs the metric's reserve.
  const bottomOffset = variant === 'material' ? bottomChrome.fixedFooterBottom : insets.bottom;

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onHeightChange?.(event.nativeEvent.layout.height);
    },
    [onHeightChange],
  );

  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      onLayout={onHeightChange ? handleLayout : undefined}
      style={[styles.container, { bottom: bottomOffset }]}
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
        <StartGlassCapsule label={label} icon={materialIcon} onPress={onPress} disabled={disabled} loading={loading} />
      )}
    </View>
  );
}

/**
 * The Liquid Glass Start capsule: a brand-tinted glass pill (real iOS 26 glass via
 * `GlassSurface`, with an opaque brand fill on the no-glass fallback) rather than a
 * flat filled button. Off native glass it gets a shadow + hairline so it still
 * reads as a raised control.
 */
function StartGlassCapsule({
  label,
  icon,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { brandColors, systemColors } = useTheme();
  const nativeGlass = useNativeGlass();
  const inactive = disabled || loading;

  const handlePress = useCallback(() => {
    if (inactive) return;
    hapticLight();
    onPress();
  }, [inactive, onPress]);

  return (
    <PressableSurface
      onPress={handlePress}
      feedback="scale"
      scaleTo={0.96}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      accessibilityLabel={label}
      style={[
        styles.capsule,
        { opacity: disabled ? 0.5 : 1 },
        !nativeGlass && shadows.sm,
        !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
      ]}
    >
      <GlassSurface
        glassEffectStyle="regular"
        tintColor={brandColors.primary}
        fallbackColor={brandColors.primaryFill}
        borderRadius={CAPSULE_RADIUS}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Icon name={icon} size={18} color={brandColors.onPrimary} />
      <Text variant="body" color={brandColors.onPrimary} style={styles.capsuleLabel}>
        {label}
      </Text>
    </PressableSurface>
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
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: CAPSULE_HEIGHT,
    paddingHorizontal: spacing[5],
    borderRadius: CAPSULE_RADIUS,
    overflow: 'hidden',
  },
  capsuleLabel: {
    fontWeight: '600',
  },
});
