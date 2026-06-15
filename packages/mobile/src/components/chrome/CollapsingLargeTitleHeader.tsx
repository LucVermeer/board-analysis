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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/theme-provider';
import { spacing } from '../../theme/tokens';
import { Text } from '../Text';
import { ProgressiveBlur } from '../ProgressiveBlur';
import { TOP_ACTION_SIZE } from './GlassActionToolbar';

const ROW_GUTTER = spacing[4];
// The centre content hands off to the optional plain inline title over this
// scroll distance: the centred content fades out, the inline title fades in.
export const COLLAPSE_START = 6;
export const COLLAPSE_END = 48;

/**
 * Collapse math for the optional plain inline title (Climbs only). Returns the
 * 0→1 `progress` plus a `collapsed` boolean that flips past the midpoint so the
 * faded-out centre content stops capturing touches.
 */
export function useCollapseProgress(scrollY: SharedValue<number> | undefined) {
  const [collapsed, setCollapsed] = useState(false);
  // scrollY is omitted on screens with no scrolled title (centre stays static);
  // fall back to 0 inside the worklet so progress is constant.
  const progress = useDerivedValue(() =>
    interpolate(scrollY?.value ?? 0, [COLLAPSE_START, COLLAPSE_END], [0, 1], Extrapolation.CLAMP),
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
  /** List scroll offset. Only needed when `collapsedInlineTitle` is set (the
   *  centre cross-fade); omit on screens whose centre content stays static. */
  scrollY?: SharedValue<number>;
  /** Optional title shown as plain centred text once scrolled (e.g. the Climbs
   *  filter summary). Cross-fades with `centerContent`. Omit to keep the centre
   *  content static with no scrolled title (Discover/Profile/Record). */
  collapsedInlineTitle?: string;
  /** Report the measured chrome height so the list can inset its top padding. */
  onHeightChange: (height: number) => void;
  /** Glass island(s) anchored to the left of the islands row. */
  leftActions?: ReactNode;
  /** Glass island(s) anchored to the right of the islands row. */
  rightActions?: ReactNode;
  /** At-rest centred control (e.g. a board pill). Stays static unless a
   *  `collapsedInlineTitle` is set, in which case it cross-fades out on scroll. */
  centerContent?: ReactNode;
  /** Extra controls rendered below the islands row (e.g. a search or segmented
   *  control row). Measured into the reported chrome height. */
  children?: ReactNode;
};

/**
 * The board-agnostic floating glass chrome shared across tabs: an always-on
 * progressive blur, a left/right glass-island row, and an optional centred
 * control. The screen renders its own large in-body title at the top of its
 * scroll content; it simply scrolls away under the blur. Climbs additionally
 * passes `collapsedInlineTitle` (its filter summary), which cross-fades in as
 * plain centred text once scrolled — the one surface that keeps a scrolled title.
 */
export function CollapsingLargeTitleHeader({
  scrollY,
  collapsedInlineTitle,
  onHeightChange,
  leftActions,
  rightActions,
  centerContent,
  children,
}: CollapsingLargeTitleHeaderProps) {
  const { systemColors } = useTheme();
  const insets = useSafeAreaInsets();
  const { progress, collapsed } = useCollapseProgress(scrollY);
  const hasInlineTitle = collapsedInlineTitle != null && scrollY != null;

  // Always-on progressive blur from the top of the screen to just below the
  // islands row; frosts content scrolling under the islands.
  const blurHeight = insets.top + spacing[1] + TOP_ACTION_SIZE + spacing[2];

  // Centre content fades out as the inline title fades in. With no inline title /
  // no scroll tracking, progress stays 0, so this is a no-op (centre stays static).
  const centerFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
  }));
  const inlineTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onHeightChange(event.nativeEvent.layout.height),
    [onHeightChange],
  );

  return (
    <View pointerEvents="box-none" style={[styles.container, { paddingTop: insets.top }]} onLayout={handleLayout}>
      {/* Always-on progressive glass: a blur from the top of the screen down to
          just below the islands, strongest up top and fading to clear, so content
          frosts out gradually and the status-bar strip reads as glass. */}
      <ProgressiveBlur style={[styles.blur, { height: blurHeight }]} />
      <View pointerEvents="box-none" style={styles.row}>
        {/* Left island (anchored left). */}
        {leftActions ? (
          <View pointerEvents="box-none" style={styles.leftAnchor}>
            {leftActions}
          </View>
        ) : null}

        {/* Centred at-rest control (e.g. board pill). Static unless an inline
            title is set, in which case it cross-fades out on scroll. */}
        {centerContent ? (
          <Animated.View
            pointerEvents={hasInlineTitle && collapsed ? 'none' : 'box-none'}
            style={[styles.centerAnchor, centerFadeStyle]}
          >
            {centerContent}
          </Animated.View>
        ) : null}

        {/* Optional plain inline title (Climbs filter summary), cross-fading in as
            the centre content fades out. Non-interactive — status-bar tap handles
            scroll-to-top. */}
        {hasInlineTitle ? (
          <Animated.View pointerEvents="none" style={[styles.centerAnchor, inlineTitleStyle]}>
            <Text
              variant="headline"
              numberOfLines={1}
              ellipsizeMode="tail"
              color={systemColors.label}
              style={styles.inlineTitle}
            >
              {collapsedInlineTitle}
            </Text>
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
  // Progressive blur layer (height applied inline): spans from the top of the
  // screen down to just below the islands row, behind the islands.
  blur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  inlineTitle: {
    fontWeight: '600',
    flexShrink: 1,
    // Keep a long title clear of the left/right islands.
    maxWidth: 180,
    textAlign: 'center',
  },
});
