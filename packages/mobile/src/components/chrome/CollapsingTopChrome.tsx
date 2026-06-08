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
import { useActiveBoard } from '../../lib/graphql/use-active-board';
import { useOptionalBluetoothContext } from '../../providers/bluetooth-provider';
import { useNativeGlass } from '../../hooks/use-native-glass';
import { spacing, shadows } from '../../theme/tokens';
import { Icon } from '../Icon';
import { Text } from '../Text';
import { GlassSurface } from '../GlassSurface';
import { PressableSurface } from '../PressableSurface';
import { BoardPill } from './BoardPill';
import { GlassActionToolbar, GlassToolbarAction, TOP_ACTION_SIZE } from './GlassActionToolbar';
import { AngleToolbarAction } from './AngleToolbarAction';
import { LightbulbToolbarAction } from './LightbulbToolbarAction';

const ROW_GUTTER = spacing[4];
const TOP_TOOLBAR_RADIUS = TOP_ACTION_SIZE / 2;
const TITLE_PILL_HEIGHT = 34;
const TITLE_PILL_RADIUS = TITLE_PILL_HEIGHT / 2;
// The large in-body title collapses into the header over this scroll distance:
// the centred board pill fades out as the title capsule and a compact board glyph
// (docked into the lightbulb's glass toolbar) take over.
const COLLAPSE_START = 6;
const COLLAPSE_END = 48;

type CollapsingTopChromeProps = {
  /** The screen's identity, shown in the centred collapsed capsule. Callers render
   *  the matching large in-body title at the top of their scroll content. */
  title: string;
  /** VoiceOver label for the collapsed title capsule. Defaults to `title`. */
  titleAccessibilityLabel?: string;
  /** Gate the create action (left island). */
  canCreate: boolean;
  /** The screen's defining create action. */
  onCreate: () => void;
  /** VoiceOver label for the create action (namespace differs per screen). */
  createAccessibilityLabel: string;
  /** Open the full board switcher; the board pill doubles as the board filter. */
  onOpenBoardSwitcher: () => void;
  /** Optional VoiceOver hint for the board pill. */
  boardPillAccessibilityHint?: string;
  /** Report the measured chrome height so the list can inset its top padding. */
  onHeightChange: (height: number) => void;
  /** List scroll offset, driving the title collapse. */
  scrollY: SharedValue<number>;
  /** Tapping the collapsed title capsule scrolls the list back to the top. */
  onPressTitle: () => void;
  /** Extra controls rendered below the islands row (e.g. the Climbs search row).
   *  Discover passes none. Measured into the reported chrome height. */
  children?: ReactNode;
};

/**
 * Shared floating glass chrome — a centred board pill flanked by angle / create /
 * light islands over a fade scrim. On scroll the screen's large in-body title
 * collapses into a centred capsule here, while the board control docks into the
 * right-hand glass toolbar beside the lightbulb. The glass surfaces never animate
 * their opacity (which flattens iOS liquid glass) — the board reveal animates the
 * toolbar's width instead, so it stays a live glass surface like the left island.
 *
 * Used by the Discover tab (`DiscoverTopChrome`) and the Climbs/Search tab
 * (`ClimbTopChrome`, which adds a search row via `children`).
 */
export function CollapsingTopChrome({
  title,
  titleAccessibilityLabel,
  canCreate,
  onCreate,
  createAccessibilityLabel,
  onOpenBoardSwitcher,
  boardPillAccessibilityHint,
  onHeightChange,
  scrollY,
  onPressTitle,
  children,
}: CollapsingTopChromeProps) {
  const { systemColors } = useTheme();
  const nativeGlass = useNativeGlass();
  const insets = useSafeAreaInsets();
  const { data: activeBoard } = useActiveBoard();
  const bluetooth = useOptionalBluetoothContext();

  const canOpenAngle = activeBoard?.isAngleAdjustable !== false && activeBoard?.angle != null;
  const leftActionCount = (canCreate ? 1 : 0) + (canOpenAngle ? 1 : 0);

  // The right glass toolbar holds the lightbulb at rest and grows to also hold a
  // compact board glyph once collapsed (board sits left of the light).
  const lightActions = bluetooth ? 1 : 0;
  const collapsedRightActions = (activeBoard ? 1 : 0) + lightActions;
  const expandedRightWidth = lightActions * TOP_ACTION_SIZE;
  const collapsedRightWidth = collapsedRightActions * TOP_ACTION_SIZE;

  // `collapsed` flips once past the midpoint so only the visible board control is
  // tappable (the faded-out centre pill mustn't keep capturing touches).
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

  // Only the centre board pill (which is leaving) fades — flattening its glass
  // mid-fade is invisible because it's disappearing. Everything that *stays* uses
  // transform/width, never opacity, so the live glass survives.
  const fullPillStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0.5, 0.85], [6, 0], Extrapolation.CLAMP) },
      { scale: interpolate(progress.value, [0.5, 0.85], [0.94, 1], Extrapolation.CLAMP) },
    ],
  }));
  const rightToolbarStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0.4, 1], [expandedRightWidth, collapsedRightWidth], Extrapolation.CLAMP),
  }));
  const boardGlyphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onHeightChange(event.nativeEvent.layout.height),
    [onHeightChange],
  );

  return (
    <View pointerEvents="box-none" style={[styles.container, { paddingTop: insets.top }]} onLayout={handleLayout}>
      {/* Scrim: the screen background fading to clear, so content scrolling up
          doesn't bleed through the gaps between the islands. */}
      <LinearGradient
        pointerEvents="none"
        colors={[systemColors.background, systemColors.background, 'transparent'] as const}
        locations={[0, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="box-none" style={styles.row}>
        {/* Left island: create + angle (anchored left). */}
        <View pointerEvents="box-none" style={styles.leftAnchor}>
          {leftActionCount > 0 ? (
            <GlassActionToolbar actionCount={leftActionCount}>
              {canCreate ? (
                <GlassToolbarAction onPress={onCreate} accessibilityLabel={createAccessibilityLabel}>
                  <Icon name="plus" size={24} color={systemColors.label} />
                </GlassToolbarAction>
              ) : null}
              <AngleToolbarAction />
            </GlassActionToolbar>
          ) : null}
        </View>

        {/* Full board pill, centered at rest; fades out as the title takes over. */}
        <Animated.View pointerEvents={collapsed ? 'none' : 'box-none'} style={[styles.centerAnchor, fullPillStyle]}>
          <BoardPill onPress={onOpenBoardSwitcher} accessibilityHint={boardPillAccessibilityHint} />
        </Animated.View>

        {/* Collapsed title capsule, centered; tap scrolls to the top. Transform-only
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

        {/* Right glass toolbar: lightbulb at rest, widening to dock the board glyph
            once collapsed. The glass surface stays at full opacity (its width
            animates), so it reads as live glass like the left island. */}
        {collapsedRightWidth > 0 ? (
          <Animated.View
            style={[
              styles.rightToolbar,
              rightToolbarStyle,
              !nativeGlass && shadows.sm,
              !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
            ]}
          >
            <GlassSurface
              glassEffectStyle="regular"
              fallbackColor={systemColors.elevatedSurface}
              borderRadius={TOP_TOOLBAR_RADIUS}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {activeBoard ? (
              <Animated.View pointerEvents={collapsed ? 'auto' : 'none'} style={boardGlyphStyle}>
                <GlassToolbarAction
                  onPress={onOpenBoardSwitcher}
                  accessibilityLabel={boardPillAccessibilityHint ?? title}
                >
                  <Icon name="boards" size={20} color={systemColors.label} />
                </GlassToolbarAction>
              </Animated.View>
            ) : null}
            {bluetooth ? <LightbulbToolbarAction /> : null}
          </Animated.View>
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
  rightToolbar: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: TOP_ACTION_SIZE,
    borderRadius: TOP_TOOLBAR_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
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
    // Match the board pill's width cap so a long filter title ellipsizes rather
    // than running under the left/right islands (both stay visible when collapsed).
    maxWidth: 180,
  },
  titleText: {
    fontWeight: '600',
    flexShrink: 1,
  },
});
