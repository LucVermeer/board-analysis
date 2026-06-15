import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from '@react-native-community/blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../providers/theme-provider';

// MaskedView shows where the mask is opaque and hides where it's transparent, so a
// black→transparent vertical gradient keeps the blur at full strength up top and
// fades it to clear toward the bottom. The default holds full blur for the top
// ~55% (status bar + top of the islands) then fades it out across the rest.
const MASK_COLORS = ['#000000', '#000000', 'transparent'] as const;
const DEFAULT_MASK_LOCATIONS = [0, 0.55, 1] as const;

type ProgressiveBlurProps = {
  /** Absolute position/size of the blur region (set by the caller). */
  style?: StyleProp<ViewStyle>;
  /** Blur strength where the mask is fully opaque. */
  blurAmount?: number;
  /** Mask stops: full blur to `[1]`, faded to clear by `[2]`. */
  maskLocations?: readonly [number, number, number];
};

/**
 * A top-down progressive (gradient) blur: a uniform `BlurView` faded out toward the
 * bottom by a vertical gradient mask. Rendered behind the floating header islands
 * so content scrolling up frosts out gradually (instead of bleeding through the
 * gaps between them) and the status-bar / Dynamic Island strip reads as glass
 * rather than an opaque band. The blur tint follows the app's resolved colour
 * scheme, so it honours the in-app light/dark override (the OS-trait-driven native
 * material would not).
 */
export function ProgressiveBlur({
  style,
  blurAmount = 24,
  maskLocations = DEFAULT_MASK_LOCATIONS,
}: ProgressiveBlurProps) {
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  return (
    <MaskedView
      pointerEvents="none"
      style={style}
      maskElement={<LinearGradient colors={MASK_COLORS} locations={maskLocations} style={StyleSheet.absoluteFill} />}
    >
      <BlurView
        // The ultra-thin material is a light, very translucent frost (vs the heavy
        // `dark`/`light` UIBlurEffect, which read as a near-opaque cap behind the
        // Dynamic Island). The explicit Dark/Light variant follows our resolved
        // scheme, so it still honours the in-app light/dark override.
        blurType={isDark ? 'ultraThinMaterialDark' : 'ultraThinMaterialLight'}
        blurAmount={blurAmount}
        reducedTransparencyFallbackColor={isDark ? '#000000' : '#F2F2F2'}
        style={StyleSheet.absoluteFill}
      />
    </MaskedView>
  );
}
