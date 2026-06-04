import { useEffect } from 'react';
import { type ColorValue, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GlassSurface } from './GlassSurface';
import { PressableSurface } from './PressableSurface';
import { Icon } from './Icon';
import { Text } from './Text';
import type { IconName } from './icon-map';
import { useTheme } from '../providers/theme-provider';
import { iosSystemColors } from '../theme/ios-colors';
import { timing } from '../theme/animations';
import { glassSize } from '../theme/layout';
import { useReduceMotion } from '../hooks/use-reduce-motion';

type GlassIconButtonProps = {
  iconName: IconName;
  iconColor: ColorValue;
  iconSize?: number;
  onPress: () => void;
  accessibilityLabel: string;
  /** Hint describing what activation does — useful when the button morphs in
   *  place (e.g. search ↔ close) rather than navigating. */
  accessibilityHint?: string;
  /** Translucent tint composited on the glass (iOS). Omit for a neutral surface. */
  tintColor?: string;
  /** Solid colour used on Android, Reduce Transparency, and the cold-start frame. */
  fallbackColor: ColorValue;
  /** Frost strength for the iOS < 26 blur fallback (see `glassMaterial`). Default
   *  is GlassSurface's `regular`; pass `glassMaterial.thick` for a FAB floating
   *  over bright, saturated content. */
  blurAmount?: number;
  /** Count badge (top-right). Rendered only when > 0. */
  badgeCount?: number;
  disabled?: boolean;
  /** Diameter of the circular target (default `glassSize.standard` — the standard
   *  floating FAB; pass `glassSize.hero` for a surface's defining action). */
  size?: number;
  /**
   * Optional second glyph the button morphs to (e.g. search ↔ close). When set,
   * the two icons cross-fade over `active`; honours Reduce Motion (instant swap).
   */
  secondaryIconName?: IconName;
  /** Drives the morph: false shows `iconName`, true shows `secondaryIconName`. */
  active?: boolean;
};

/**
 * Circular Liquid Glass button — the floating-control affordance shared by the
 * climb-list search row (filter, create) and the bottom-bar search FAB. The glass
 * fills a clipped circle so the iOS < 26 blur fallback doesn't spill past the
 * radius; the badge sits in an outer, unclipped wrapper so a round corner can't
 * crop it. Routes through GlassSurface (glass → blur → solid) and PressableSurface
 * (spring / ripple), so Android, Reduce Transparency, and cold-start all degrade
 * correctly. With `secondaryIconName`, the glyph cross-fades on `active`.
 */
export function GlassIconButton({
  iconName,
  iconColor,
  iconSize = 22,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  tintColor,
  fallbackColor,
  blurAmount,
  badgeCount,
  disabled = false,
  size = glassSize.standard,
  secondaryIconName,
  active = false,
}: GlassIconButtonProps) {
  const { brandColors } = useTheme();
  const reduceMotion = useReduceMotion();
  const showBadge = badgeCount != null && badgeCount > 0;

  // 0 → primary glyph, 1 → secondary glyph. Only used when `secondaryIconName` is set.
  const morph = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    const target = active ? 1 : 0;
    morph.value = reduceMotion ? target : withTiming(target, { duration: timing.fast });
  }, [active, reduceMotion, morph]);

  const primaryIconStyle = useAnimatedStyle(() => ({ opacity: 1 - morph.value }));
  const secondaryIconStyle = useAnimatedStyle(() => ({ opacity: morph.value }));

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
        accessibilityHint={accessibilityHint}
        style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <GlassSurface
          glassEffectStyle="regular"
          tintColor={tintColor}
          fallbackColor={fallbackColor}
          borderRadius={size / 2}
          blurAmount={blurAmount}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {secondaryIconName ? (
          <>
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, primaryIconStyle]} pointerEvents="none">
              <Icon name={iconName} size={iconSize} color={iconColor as string} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, secondaryIconStyle]} pointerEvents="none">
              <Icon name={secondaryIconName} size={iconSize} color={iconColor as string} />
            </Animated.View>
          </>
        ) : (
          <Icon name={iconName} size={iconSize} color={iconColor as string} />
        )}
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
  center: {
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
