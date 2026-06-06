import { type ReactNode } from 'react';
import { StyleSheet, View, type ColorValue, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { GlassView, type GlassStyle } from 'expo-glass-effect';
import { useTheme } from '../providers/theme-provider';
import { iosDarkColors, iosLightColors } from '../theme/ios-colors';
import { shadows } from '../theme/tokens';
import { useEffectiveSurfaceMode } from '../hooks/use-effective-surface-mode';

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
  /**
   * Let the native Liquid Glass react to touches with Apple's own press/highlight
   * (iOS 26 only — ignored on the blur/solid fallback, where the consumer's
   * PressableSurface supplies the feedback). Only takes effect when the GlassView
   * is the touch target; a `pointerEvents="none"` glass behind content won't see
   * the touch.
   */
  isInteractive?: boolean;
  pointerEvents?: ViewProps['pointerEvents'];
};

/**
 * One background primitive for every translucent / tonal surface. Picks the
 * right material for the device, variant and a11y settings via
 * `useEffectiveSurfaceMode()`, and renders cleanly for each:
 *
 *   glass    → expo-glass-effect GlassView (iOS 26 Liquid Glass — preferred)
 *   blur     → @react-native-community/blur frosted blur (iOS < 26 fallback)
 *   material → opaque Material 3 tonal surface + elevation shadow
 *   solid    → flat themed surface (Reduce Transparency, or Android on glass)
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
  isInteractive = false,
  pointerEvents,
}: GlassSurfaceProps) {
  const { systemColors, colorScheme } = useTheme();
  const mode = useEffectiveSurfaceMode();
  const isDark = colorScheme === 'dark';

  const solidColor = fallbackColor ?? systemColors.secondaryBackground;
  const radius = borderRadius != null ? { borderRadius } : null;
  // The blur/solid paths have no native shape, so clip them to the radius here.
  const clippedRadius = borderRadius != null ? { borderRadius, overflow: 'hidden' as const } : null;

  // Solid: Reduce Transparency (a11y) on any platform, or Android forced onto
  // the Liquid Glass variant. Flat fill, no elevation.
  if (mode === 'solid') {
    return (
      <View style={[style, clippedRadius, { backgroundColor: solidColor }]} pointerEvents={pointerEvents}>
        {children}
      </View>
    );
  }

  // Material: opaque M3 tonal surface. Background + radius + shadow live on the
  // same view (no `overflow: 'hidden'`, which would clip the iOS shadow) so the
  // surface casts a real elevation shadow with rounded corners. A tint is
  // composited as a translucent overlay, matching the blur path.
  if (mode === 'material') {
    return (
      <View style={[style, radius, shadows.sm, { backgroundColor: solidColor }]} pointerEvents={pointerEvents}>
        {tintColor ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, radius, { backgroundColor: tintColor }]} />
        ) : null}
        {children}
      </View>
    );
  }

  // Glass: real iOS 26 Liquid Glass. The radius goes on the GlassView itself so
  // the native glass renders a rounded shape with its own clean edge (no parent
  // clip or RN border, which would seam at the cardinal points of a circle).
  if (mode === 'glass') {
    return (
      <View style={style} pointerEvents={pointerEvents}>
        <GlassView
          glassEffectStyle={glassEffectStyle}
          tintColor={tintColor}
          isInteractive={isInteractive}
          colorScheme={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, radius]}
        />
        {children}
      </View>
    );
  }

  // Blur: iOS < 26 frosted approximation (matches the pre-Liquid-Glass tab bar).
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
