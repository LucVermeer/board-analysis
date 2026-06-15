import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from '@react-native-community/blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../providers/theme-provider';

// A black→transparent vertical mask: MaskedView shows where the mask is opaque and
// hides where it's transparent, so each blur layer is full strength at the top and
// fades to clear by its `fadeEnd`.
const MASK_COLORS = ['#000000', 'transparent'] as const;
// Stacked layers fake a *variable* blur: a single masked blur only fades its
// opacity (uniform radius), which reads as an abrupt edge. Stacking N thin layers,
// each fading out higher than the last, means the top is covered by every layer
// (max blur) and the bottom by just one — so the effective blur radius ramps
// smoothly. More layers = smoother (and more GPU work).
const DEFAULT_LAYERS = 5;

type ProgressiveBlurProps = {
  /** Absolute position/size of the blur region (set by the caller). */
  style?: StyleProp<ViewStyle>;
  /** Blur strength per layer (honoured by the basic blur types; the ultra-thin
   *  material defines its own radius and the ramp comes from stacking). */
  blurAmount?: number;
  /** Number of stacked blur layers — higher is a smoother ramp, more GPU work. */
  layers?: number;
};

/**
 * A top-down progressive (gradient) blur for the floating header chrome: several
 * ultra-thin blur layers stacked so the blur radius ramps smoothly from strong at
 * the top to nothing at the bottom (a true variable blur, not just a faded uniform
 * one). Content scrolling up frosts out gradually and the status-bar / Dynamic
 * Island strip reads as light glass. The blur tint follows the app's resolved
 * colour scheme, so it honours the in-app light/dark override.
 */
export function ProgressiveBlur({ style, blurAmount = 16, layers = DEFAULT_LAYERS }: ProgressiveBlurProps) {
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  // Ultra-thin material: a light, very translucent frost. Stacking accumulates it
  // toward the top without ever reading as the heavy `dark`/`light` UIBlurEffect.
  const blurType = isDark ? 'ultraThinMaterialDark' : 'ultraThinMaterialLight';
  const fallbackColor = isDark ? '#000000' : '#F2F2F2';

  return (
    <View pointerEvents="none" style={style}>
      {Array.from({ length: layers }, (_, layer) => {
        // Later layers fade out higher up, so they accumulate toward the top.
        const fadeEnd = (layers - layer) / layers;
        return (
          <MaskedView
            key={layer}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient colors={MASK_COLORS} locations={[0, fadeEnd]} style={StyleSheet.absoluteFill} />
            }
          >
            <BlurView
              blurType={blurType}
              blurAmount={blurAmount}
              reducedTransparencyFallbackColor={fallbackColor}
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        );
      })}
    </View>
  );
}
