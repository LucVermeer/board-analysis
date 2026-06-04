import { Platform } from 'react-native';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useReduceTransparency } from './use-reduce-transparency';

/**
 * Whether the real iOS 26 Liquid Glass path is active — i.e. `GlassSurface`
 * renders a native `GlassView` rather than the blur/solid fallback. Native glass
 * draws its own refractive edge, so on this path components should drop their
 * hand-drawn hairline borders and separation shadows (those belong to the
 * fallback, where the blur has no intrinsic edge). Mirrors the branch logic in
 * `GlassSurface`, kept in one place so the chrome stays in agreement.
 */
export function useNativeGlass(): boolean {
  const reduceTransparency = useReduceTransparency();
  return (
    Platform.OS === 'ios' && !reduceTransparency && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()
  );
}
