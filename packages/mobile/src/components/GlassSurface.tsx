import { type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type ColorValue,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable, type GlassStyle } from 'expo-glass-effect';
import { useTheme } from '../providers/theme-provider';
import { iosDarkColors, iosLightColors } from '../theme/ios-colors';
import { useReduceTransparency } from '../hooks/use-reduce-transparency';

type GlassSurfaceProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 'regular' = frosted, elevated chrome (tab bar, sheets); 'clear' = lighter, content-forward (floating bars). */
  glassEffectStyle?: GlassStyle;
  /**
   * Tint composited onto the glass / blur (e.g. a climb's grade hue). Keep it
   * translucent so the underlying content still shows through the glass.
   */
  tintColor?: string;
  /**
   * Solid background used on Android and when Reduce Transparency is enabled.
   * Defaults to the theme's secondary background. Pass an opaque tint here when
   * a surface wants its tint to survive on the no-glass path.
   */
  fallbackColor?: ColorValue;
  /**
   * Corner radius for a shaped surface (pill / circle). On iOS 26 it is handed to
   * the native GlassView so the glass renders its own rounded shape with Apple's
   * clean edge — DON'T clip a square glass with a parent `overflow`/`borderWidth`
   * (an RN border on a circle seams at the 12/3/6/9 arc joins). The blur and solid
   * fallbacks clip to the radius themselves.
   */
  borderRadius?: number;
  /** Blur strength for the iOS < 26 fallback. */
  blurAmount?: number;
  pointerEvents?: ViewProps['pointerEvents'];
};

/**
 * One background primitive for every translucent surface. Picks the best
 * available material for the device and degrades cleanly:
 *
 *   iOS 26+            → expo-glass-effect GlassView (true Liquid Glass)
 *   iOS < 26           → @react-native-community/blur frosted blur
 *   Android            → solid themed surface
 *   Reduce Transparency → solid themed surface (any platform)
 *
 * It fills its parent like gorhom's `backgroundComponent`; consumers stack
 * content on top either as children or as siblings.
 */
export function GlassSurface({
  children,
  style,
  glassEffectStyle = 'regular',
  tintColor,
  fallbackColor,
  borderRadius,
  blurAmount = 20,
  pointerEvents,
}: GlassSurfaceProps) {
  const { systemColors, colorScheme } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const isDark = colorScheme === 'dark';

  const solidColor = fallbackColor ?? systemColors.secondaryBackground;
  const radius = borderRadius != null ? { borderRadius } : null;
  // The blur/solid paths have no native shape, so clip them to the radius here.
  const clippedRadius = borderRadius != null ? { borderRadius, overflow: 'hidden' as const } : null;

  // Honour Reduce Transparency strictly — no glass, no blur.
  if (reduceTransparency) {
    return (
      <View style={[style, clippedRadius, { backgroundColor: solidColor }]} pointerEvents={pointerEvents}>
        {children}
      </View>
    );
  }

  // iOS 26+: real Liquid Glass. The radius goes on the GlassView itself so the
  // native glass renders a rounded shape with its own clean edge (no parent clip
  // or RN border, which would seam at the cardinal points of a circle).
  if (Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return (
      <View style={style} pointerEvents={pointerEvents}>
        <GlassView
          glassEffectStyle={glassEffectStyle}
          tintColor={tintColor}
          colorScheme={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, radius]}
        />
        {children}
      </View>
    );
  }

  // iOS < 26: frosted blur approximation (matches the existing tab-bar look).
  if (Platform.OS === 'ios') {
    return (
      <View style={[style, clippedRadius]} pointerEvents={pointerEvents}>
        <BlurView
          blurType={isDark ? 'dark' : 'light'}
          blurAmount={blurAmount}
          reducedTransparencyFallbackColor={
            isDark ? iosDarkColors.secondaryBackground : iosLightColors.secondaryBackground
          }
          style={StyleSheet.absoluteFill}
        />
        {tintColor ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tintColor }]} />
        ) : null}
        {children}
      </View>
    );
  }

  // Android: solid themed surface (or an opaque tint via fallbackColor).
  return (
    <View style={[style, clippedRadius, { backgroundColor: solidColor }]} pointerEvents={pointerEvents}>
      {children}
    </View>
  );
}
