import { type ColorValue } from 'react-native';
import type { BottomSheetBackgroundProps } from '@gorhom/bottom-sheet';
import { useTheme } from '../providers/theme-provider';
import { sheetStyles } from '../theme/tokens';
import { GlassSurface } from './GlassSurface';

type SheetGlassBackgroundProps = BottomSheetBackgroundProps & {
  /** Solid background for the no-glass path. Defaults to the theme's secondary background. */
  fallbackColor?: ColorValue;
};

/**
 * Shared `backgroundComponent` for @gorhom bottom sheets — renders a Liquid
 * Glass / blur / solid surface clipped to the sheet's rounded top edge.
 *
 * Forwarding gorhom's `pointerEvents` (it always passes `"none"`) is what keeps
 * the glass from swallowing taps on empty sheet regions, so they still fall
 * through to the backdrop.
 */
export function SheetGlassBackground({ style, pointerEvents, fallbackColor }: SheetGlassBackgroundProps) {
  const { systemColors } = useTheme();
  return (
    <GlassSurface
      glassEffectStyle="regular"
      fallbackColor={fallbackColor ?? systemColors.secondaryBackground}
      pointerEvents={pointerEvents}
      style={[style, sheetStyles.background]}
    />
  );
}
