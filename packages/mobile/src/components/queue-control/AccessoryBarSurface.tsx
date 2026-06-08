import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassSurface } from '../GlassSurface';
import { useTheme } from '../../providers/theme-provider';
import { useEffectiveSurfaceMode } from '../../hooks/use-effective-surface-mode';
import { shadows } from '../../theme/tokens';

export type AccessoryBarSurfaceTreatment = 'floating' | 'docked';

type AccessoryBarSurfaceProps = {
  /** Surface height; the default radius is a full pill (`height / 2`). */
  height: number;
  borderRadius?: number;
  /** Material can dock the surface to the tab bar instead of rendering a floating pill. */
  treatment?: AccessoryBarSurfaceTreatment;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * The variant-aware background for a floating "active context" pill (the climb
 * capsule today, a workout timer later). It owns ONLY the surface + height so the
 * occupant content stays variant-agnostic:
 *
 *   glass    → Liquid Glass pill (native edge — no border/shadow)
 *   material → opaque M3 tonal surface (floating pill or docked bar)
 *   blur/solid → frosted/solid fill + hairline border + separation shadow
 *
 * Reduce Transparency is handled inside `GlassSurface`/`useEffectiveSurfaceMode`
 * (it resolves to the solid branch here), so a11y stays correct without this
 * component knowing about it.
 */
export function AccessoryBarSurface({
  height,
  borderRadius,
  treatment = 'floating',
  style,
  children,
}: AccessoryBarSurfaceProps) {
  const mode = useEffectiveSurfaceMode();
  const { systemColors, variant } = useTheme();
  const radius = treatment === 'docked' ? 0 : (borderRadius ?? height / 2);
  const shape: ViewStyle = { height, borderRadius: radius };

  // Native Liquid Glass draws its own refractive edge + lift.
  if (mode === 'glass') {
    return (
      <View style={[shape, style]}>
        <GlassSurface
          glassEffectStyle="regular"
          borderRadius={radius}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {children}
      </View>
    );
  }

  // Material is already opaque, so keep it on the Material surface path even
  // when Reduce Transparency resolves translucent surfaces to solid.
  if (mode === 'material' || variant === 'material') {
    const materialSurfaceStyle: ViewStyle =
      treatment === 'docked'
        ? {
            backgroundColor: systemColors.elevatedSurface,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: systemColors.separator,
          }
        : { backgroundColor: systemColors.elevatedSurface, ...shadows.sm };
    return <View style={[shape, materialSurfaceStyle, style]}>{children}</View>;
  }

  // Blur / solid fallback: the surface has no intrinsic edge, so add the hairline
  // border and separation shadow.
  return (
    <View
      style={[shape, shadows.sm, { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator }, style]}
    >
      <GlassSurface
        fallbackColor={systemColors.elevatedSurface}
        borderRadius={radius}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}
