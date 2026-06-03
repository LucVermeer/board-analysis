import { type ColorValue, StyleSheet, View } from 'react-native';
import { GlassSurface } from './GlassSurface';
import { PressableSurface } from './PressableSurface';
import { Icon } from './Icon';
import { Text } from './Text';
import type { IconName } from './icon-map';
import { useTheme } from '../providers/theme-provider';
import { iosSystemColors } from '../theme/ios-colors';

type GlassIconButtonProps = {
  iconName: IconName;
  iconColor: ColorValue;
  iconSize?: number;
  onPress: () => void;
  accessibilityLabel: string;
  /** Translucent tint composited on the glass (iOS). Omit for a neutral surface. */
  tintColor?: string;
  /** Solid colour used on Android, Reduce Transparency, and the cold-start frame. */
  fallbackColor: ColorValue;
  /** Count badge (top-right). Rendered only when > 0. */
  badgeCount?: number;
  disabled?: boolean;
  /** Diameter of the circular target (default 44 — the HIG minimum). */
  size?: number;
};

/**
 * Circular Liquid Glass button — the floating-control affordance shared by the
 * climb-list search row (filter, create). The glass fills a clipped circle so
 * the iOS < 26 blur fallback doesn't spill past the radius; the badge sits in an
 * outer, unclipped wrapper so a round corner can't crop it. Routes through
 * GlassSurface (glass → blur → solid) and PressableSurface (spring / ripple), so
 * Android, Reduce Transparency, and cold-start all degrade correctly.
 */
export function GlassIconButton({
  iconName,
  iconColor,
  iconSize = 22,
  onPress,
  accessibilityLabel,
  tintColor,
  fallbackColor,
  badgeCount,
  disabled = false,
  size = 44,
}: GlassIconButtonProps) {
  const { brandColors } = useTheme();
  const showBadge = badgeCount != null && badgeCount > 0;

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <PressableSurface
        onPress={onPress}
        disabled={disabled}
        feedback="scale"
        scaleTo={0.92}
        rippleBorderless
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <GlassSurface
          glassEffectStyle="regular"
          tintColor={tintColor}
          fallbackColor={fallbackColor}
          borderRadius={size / 2}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Icon name={iconName} size={iconSize} color={iconColor as string} />
      </PressableSurface>

      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: brandColors.primary }]} pointerEvents="none">
          <Text variant="caption2" color={iosSystemColors.white} style={styles.badgeText}>
            {badgeCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  button: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 14,
  },
});
