import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassSurface } from '../GlassSurface';
import { useTheme } from '../../providers/theme-provider';
import { useEffectiveSurfaceMode } from '../../hooks/use-effective-surface-mode';
import { shadows } from '../../theme/tokens';

type AccessoryBarSurfaceProps = {
  /** Surface height; the default radius is a full pill (`height / 2`). */
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * The variant-aware background for a floating "active context" pill (the climb
 * capsule today, a workout timer later). It owns ONLY the surface + height so the
 * occupant content stays variant-agnostic:
 *
 *   glass    → Liquid Glass pill (native edge — no border/shadow)
 *   material → opaque M3 tonal pill + elevation (no border)
 *   blur/solid → frosted/solid fill + hairline border + separation shadow
 *
 * Reduce Transparency is handled inside `GlassSurface`/`useEffectiveSurfaceMode`
 * (it resolves to the solid branch here), so a11y stays correct without this
 * component knowing about it.
 */
export function AccessoryBarSurface({ height, borderRadius, style, children }: AccessoryBarSurfaceProps) {
  const mode = useEffectiveSurfaceMode();
  const { systemColors } = useTheme();
  const radius = borderRadius ?? height / 2;
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

  // Material: opaque M3 tonal surface + elevation; no border (elevation separates).
  if (mode === 'material') {
    return (
      <View style={[shape, { backgroundColor: systemColors.elevatedSurface }, shadows.sm, style]}>{children}</View>
    );
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
