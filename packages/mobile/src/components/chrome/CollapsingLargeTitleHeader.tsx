import { type ReactNode, useCallback, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/theme-provider';
import { useNativeGlass } from '../../hooks/use-native-glass';
import { spacing, shadows } from '../../theme/tokens';

// The scrim fades the *scene* background to clear, so it must match the
// navigation scene background set in the root ThemedNavigation: black in dark,
// the React Navigation DefaultTheme grey (rgb 242,242,242) in light. We can't
// derive it from systemColors.background — on iOS that's a PlatformColor, which
// expo-linear-gradient bakes into a static CGColor against the OS trait: it
// ignored the in-app dark override (white band when the phone was light but the
// app forced dark) AND, being pure white, banded over the grey light scene.
// Concrete per-scheme values keyed off our override-aware colorScheme fix both.
// (Defined locally to keep this component out of the PlatformColor import chain.)
const SCRIM_BACKGROUND_DARK = '#000000';
const SCRIM_BACKGROUND_LIGHT = '#F2F2F2';
import { Text } from '../Text';
import { GlassSurface } from '../GlassSurface';
import { PressableSurface } from '../PressableSurface';
import { TOP_ACTION_SIZE } from './GlassActionToolbar';

const ROW_GUTTER = spacing[4];
const TITLE_PILL_HEIGHT = 34;
const TITLE_PILL_RADIUS = TITLE_PILL_HEIGHT / 2;
// The large in-body title collapses into the header over this scroll distance:
// the centred content fades out as the title capsule takes over.
export const COLLAPSE_START = 6;
export const COLLAPSE_END = 48;

/**
 * Shared collapse math for the floating large-title chrome. Returns the 0→1
 * `progress` derived value plus a `collapsed` boolean that flips once past the
 * midpoint (so the faded-out centre content stops capturing touches). Both this
 * board-agnostic header and the board-aware `CollapsingTopChrome` (which docks a
 * board glyph) read from the same math so the title capsule and the board dock
 * stay in lockstep.
 */
export function useCollapseProgress(scrollY: SharedValue<number>) {
  const [collapsed, setCollapsed] = useState(false);
  const progress = useDerivedValue(() =>
    interpolate(scrollY.value, [COLLAPSE_START, COLLAPSE_END], [0, 1], Extrapolation.CLAMP),
  );
  useAnimatedReaction(
    () => progress.value > 0.5,
    (isPast, wasPast) => {
      if (isPast !== wasPast) runOnJS(setCollapsed)(isPast);
    },
  );
  return { progress, collapsed };
}

type CollapsingLargeTitleHeaderProps = {
  /** The screen's identity, shown in the centred collapsed capsule. Callers render
   *  the matching large in-body title at the top of their scroll content. */
  title: string;
  /** VoiceOver label for the collapsed title capsule. Defaults to `title`. */
  titleAccessibilityLabel?: string;
  /** List scroll offset, driving the title collapse. */
  scrollY: SharedValue<number>;
  /** Tapping the collapsed title capsule scrolls the list back to the top. */
  onPressTitle: () => void;
  /** Report the measured chrome height so the list can inset its top padding. */
  onHeightChange: (height: number) => void;
  /** Glass island(s) anchored to the left of the islands row. */
  leftActions?: ReactNode;
  /** Glass island(s) anchored to the right of the islands row. */
  rightActions?: ReactNode;
  /** At-rest centred control (e.g. a board pill) that fades out as the collapsed
   *  title capsule takes over. Omit on screens with no centred control. */
  centerContent?: ReactNode;
  /** Extra controls rendered below the islands row (e.g. a search or segmented
   *  control row). Measured into the reported chrome height. */
  children?: ReactNode;
};

/**
 * The board-agnostic floating glass chrome shared across tabs: a fade scrim, a
 * left/right glass-island row, and the screen's large in-body title collapsing
 * into a centred glass capsule on scroll. The capsule animates with transform
 * only (never opacity) so the live iOS liquid glass never flattens; only the
 * leaving centre content fades. Callers inject their own islands and, optionally,
 * a centred control.
 *
 * The board-aware Discover/Climbs chrome (`CollapsingTopChrome`) composes this
 * and adds the board pill plus the board-glyph dock; the Record and Profile tabs
 * use it with their own islands.
 */
export function CollapsingLargeTitleHeader({
  title,
  titleAccessibilityLabel,
  scrollY,
  onPressTitle,
  onHeightChange,
  leftActions,
  rightActions,
  centerContent,
  children,
}: CollapsingLargeTitleHeaderProps) {
  const { systemColors, colorScheme } = useTheme();
  const nativeGlass = useNativeGlass();
  const insets = useSafeAreaInsets();
  const { progress, collapsed } = useCollapseProgress(scrollY);

  // A concrete string background (Android / Material variant) is already
  // override-correct, so use it as-is; otherwise (an iOS PlatformColor, which the
  // gradient can't resolve against the override) substitute the concrete scrim
  // colour for our resolved colorScheme.
  const scrimColor =
    typeof systemColors.background === 'string'
      ? systemColors.background
      : colorScheme === 'dark'
        ? SCRIM_BACKGROUND_DARK
        : SCRIM_BACKGROUND_LIGHT;

  // The scrim is invisible at rest and fades in as content scrolls up under the
  // islands — the iOS nav-bar idiom. At rest the list insets its content below
  // the measured chrome height, so there's nothing to mask; painting an opaque
  // scrim there just showed a visible band over the scene (it can't match every
  // screen's background). Fading it on scroll removes the at-rest band while
  // still masking content that scrolls into the gaps between the islands.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 12], [0, 1], Extrapolation.CLAMP),
  }));

  // Only the centre content (which is leaving) fades — flattening its glass
  // mid-fade is invisible because it's disappearing. The capsule that *stays*
  // uses transform only, so the live glass survives.
  const centerFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0.5, 0.85], [6, 0], Extrapolation.CLAMP) },
      { scale: interpolate(progress.value, [0.5, 0.85], [0.94, 1], Extrapolation.CLAMP) },
    ],
  }));

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onHeightChange(event.nativeEvent.layout.height),
    [onHeightChange],
  );

  return (
    <View pointerEvents="box-none" style={[styles.container, { paddingTop: insets.top }]} onLayout={handleLayout}>
      {/* Scrim: matches the scene background and fades in on scroll so content
          scrolling up doesn't bleed through the gaps between the islands. Hidden
          at rest (nothing to mask). Starts below the status-bar inset so the
          Dynamic Island / status-bar strip stays transparent (content scrolls
          under it, as on a native nav bar) — only the islands row is masked. */}
      <Animated.View pointerEvents="none" style={[styles.scrim, { top: insets.top }, scrimStyle]}>
        <LinearGradient
          colors={[scrimColor, scrimColor, 'transparent'] as const}
          locations={[0, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View pointerEvents="box-none" style={styles.row}>
        {/* Left island (anchored left). */}
        {leftActions ? (
          <View pointerEvents="box-none" style={styles.leftAnchor}>
            {leftActions}
          </View>
        ) : null}

        {/* Centred at-rest control; fades out as the title takes over. */}
        {centerContent ? (
          <Animated.View pointerEvents={collapsed ? 'none' : 'box-none'} style={[styles.centerAnchor, centerFadeStyle]}>
            {centerContent}
          </Animated.View>
        ) : null}

        {/* Collapsed title capsule, centred; tap scrolls to the top. Transform-only
            entrance keeps the glass surface live (no opacity). */}
        {collapsed ? (
          <Animated.View pointerEvents="box-none" style={[styles.centerAnchor, titleStyle]}>
            <PressableSurface
              onPress={onPressTitle}
              feedback="scale"
              scaleTo={0.96}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={titleAccessibilityLabel ?? title}
            >
              <View
                style={[
                  styles.titlePill,
                  !nativeGlass && shadows.sm,
                  !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
                ]}
              >
                <GlassSurface
                  glassEffectStyle="regular"
                  fallbackColor={systemColors.elevatedSurface}
                  borderRadius={TITLE_PILL_RADIUS}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <Text
                  variant="subheadline"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  color={systemColors.label}
                  style={styles.titleText}
                >
                  {title}
                </Text>
              </View>
            </PressableSurface>
          </Animated.View>
        ) : null}

        {/* Right island(s), anchored right. */}
        {rightActions ? (
          <View pointerEvents="box-none" style={styles.rightAnchor}>
            {rightActions}
          </View>
        ) : null}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  // Sits below the status-bar inset (top is applied inline) so the scrim never
  // covers the Dynamic Island / status-bar strip — only the islands row + below.
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  row: {
    height: TOP_ACTION_SIZE,
    marginHorizontal: ROW_GUTTER,
    marginVertical: spacing[1],
  },
  leftAnchor: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  rightAnchor: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  centerAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TITLE_PILL_HEIGHT,
    borderRadius: TITLE_PILL_RADIUS,
    paddingHorizontal: 16,
    // Clip the absolutely-filled GlassSurface to the rounded corners on Android.
    overflow: 'hidden',
    // Match the board pill's width cap so a long title ellipsizes rather than
    // running under the left/right islands (both stay visible when collapsed).
    maxWidth: 180,
  },
  titleText: {
    fontWeight: '600',
    flexShrink: 1,
  },
});
