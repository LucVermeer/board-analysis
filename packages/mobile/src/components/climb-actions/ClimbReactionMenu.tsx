import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BlurView } from '@react-native-community/blur';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BoardName, Climb } from '@boardsesh/shared-schema';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ListRow } from '../ListRow';
import { GlassSurface } from '../GlassSurface';
import { BoardImageNative } from '../BoardImageNative';
import { ClimbAttributeIcons } from '../ClimbAttributeIcons';
import { InlinePlaylistPicker } from '../playlist/InlinePlaylistPicker';
import { getBoardRenderData } from '../../lib/board-details';
import { formatSends, formatQuality } from '../../lib/format-climb-stats';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { useTheme } from '../../providers/theme-provider';
import type { BoardConfig } from '../../providers/drawer-host-provider';
import { springs, timing } from '../../theme/animations';
import { spacing, borderRadius } from '../../theme/tokens';
import { useClimbActions } from './use-climb-actions';

type ClimbReactionMenuProps = {
  climb: Climb;
  boardConfig: BoardConfig;
  currentUserId?: string | null;
  isAuthenticated: boolean;
  onEditEntry?: () => void;
  /** When provided, the "Add beta video" action runs this instead of opening the
   *  root beta sheet — the play drawer passes its own in-tree opener so the sheet
   *  stacks above the `/play` modal (#3505). */
  onAddBetaVideo?: () => void;
  /** Read once at the app root (resolved) and passed in, so the mount-time enter
   *  animation uses the real value rather than useReduceMotion's conservative default. */
  reduceMotion: boolean;
  onClose: () => void;
};

// iOS portals above the persistent queue bar / tab bar via a native window overlay;
// Android uses a transparent Modal (which also gives a hardware-back handler).
function OverlayPortal({ children, onRequestClose }: { children: React.ReactNode; onRequestClose: () => void }) {
  if (Platform.OS === 'ios') return <FullWindowOverlay>{children}</FullWindowOverlay>;
  return (
    <Modal transparent statusBarTranslucent visible animationType="none" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

function fitBoardArt(boardWidth: number, boardHeight: number, maxSize: number) {
  const aspect = boardWidth / boardHeight;
  if (!Number.isFinite(aspect) || aspect <= 0) return { width: maxSize, height: maxSize };
  return aspect >= 1 ? { width: maxSize, height: maxSize / aspect } : { width: maxSize * aspect, height: maxSize };
}

/**
 * iMessage-style long-press reaction overlay: the climb floats, scaled up, over a
 * blurred background, with the climb-action menu floating beside it. Built with
 * Reanimated + BlurView so we control the enlargement, the animation, and the layout
 * — the native context-menu library can't host a custom enlarged preview on RN's New
 * Architecture (the preview leaks into the row). Used for every list long-press via
 * the provider's `openClimbActions`; PlayDrawer keeps its own bottom sheet.
 *
 * Mounted only while open; the enter animation runs on mount (using the passed
 * `reduceMotion`), and dismissal animates out before calling `onClose`. Actions come
 * from the shared `useClimbActions` hook — the same list the bottom sheet renders.
 */
export function ClimbReactionMenu({
  climb,
  boardConfig,
  currentUserId,
  isAuthenticated,
  onEditEntry,
  onAddBetaVideo,
  reduceMotion,
  onClose,
}: ClimbReactionMenuProps) {
  const { colorScheme } = useTheme();
  const { t } = useTranslation('climbs');
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { formatGrade } = useGradeFormat();

  const progress = useSharedValue(0);
  // 'menu' shows the action list; 'playlist' swaps the card to the inline
  // playlist picker (no second sheet — that's the #3294 fix).
  const [view, setView] = useState<'menu' | 'playlist'>('menu');

  const finishClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    progress.value = reduceMotion ? 1 : withSpring(1, springs.gentle);
  }, [progress, reduceMotion]);

  const dismiss = useCallback(() => {
    if (reduceMotion) {
      finishClose();
      return;
    }
    progress.value = withTiming(0, { duration: timing.fast }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [progress, reduceMotion, finishClose]);

  const backToMenu = useCallback(() => setView('menu'), []);
  // Stable so useClimbActions' memo doesn't rebuild the action list every render.
  const openPlaylist = useCallback(() => setView('playlist'), []);

  // Hardware back (Android) / VoiceOver escape: pop the playlist view first,
  // dismiss the whole overlay only from the top-level menu.
  const handleRequestClose = useCallback(() => {
    if (view === 'playlist') {
      backToMenu();
      return;
    }
    dismiss();
  }, [view, backToMenu, dismiss]);

  const actions = useClimbActions({
    climb,
    boardConfig,
    currentUserId,
    isAuthenticated,
    onEditEntry,
    onAfterAction: dismiss,
    onSelectPlaylist: openPlaylist,
    onAddBetaVideo,
  });

  const gradeColor = getGradeColor(climb.difficulty) ?? DEFAULT_GRADE_COLOR;
  const formattedGrade = formatGrade(climb.difficulty);

  // Subtle byline under the name: sends · quality★ · setter (each dropped when
  // absent). Mirrors the climb-list row's primary subtitle.
  const byline = useMemo(() => {
    const parts: string[] = [];
    if (!climb.is_draft && climb.ascensionist_count) parts.push(formatSends(climb.ascensionist_count, t));
    if (parseFloat(climb.quality_average) > 0) parts.push(`${formatQuality(climb.quality_average)}★`);
    if (climb.setter_username) parts.push(climb.setter_username);
    return parts.join(' · ');
  }, [climb.is_draft, climb.ascensionist_count, climb.quality_average, climb.setter_username, t]);

  // Track the keyboard height (the inline create form focuses a TextInput). When it's
  // up, the card's bottom must sit at the keyboard's top (not the screen's), and the
  // climb art shrinks so the preview + form still fit above it on shorter phones.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    // iOS `will*` events fire before the animation (and don't exist on Android);
    // Android only fires the `did*` pair. Read the keyboard height straight off the
    // event (absolute — no windowHeight), so empty deps: on Android `adjustResize`
    // the keyboard shrinks windowHeight, and a windowHeight dep would tear down and
    // re-register this listener mid-event and miss it.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates?.height ?? 0));
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  // Enlarged board art, reusing the list thumbnail's cache (filledStyle + renderWidth
  // 400) so no new render is needed. Sized to the screen so it stays "blown up" but
  // leaves room for the menu (~20% larger than the first pass); shrunk while the
  // keyboard is up so the create form clears it.
  const artMaxSize = Math.min(
    keyboardHeight > 0 ? Math.round(windowHeight * 0.18) : 235,
    Math.round(windowHeight * 0.31),
    Math.round(windowWidth * 0.66),
  );
  const boardRenderData = useMemo(() => {
    const setIdValues = boardConfig.setIds
      .split(',')
      .map((setIdText) => Number(setIdText))
      .filter((setIdValue) => Number.isFinite(setIdValue));
    if (setIdValues.length === 0) return null;
    return getBoardRenderData({
      boardName: boardConfig.boardName as BoardName,
      layoutId: boardConfig.layoutId,
      sizeId: boardConfig.sizeId,
      setIds: setIdValues,
    });
  }, [boardConfig]);

  const artStyle = useMemo<ViewStyle | null>(() => {
    if (!boardRenderData) return null;
    const fitted = fitBoardArt(boardRenderData.boardWidth, boardRenderData.boardHeight, artMaxSize);
    return { width: fitted.width, height: fitted.height, borderRadius: borderRadius.lg, overflow: 'hidden' };
  }, [boardRenderData, artMaxSize]);

  // Top offset for the floating content — anchors the preview at a fixed position
  // (see styles.content). Shared with the menu cap so the card can't run past the
  // bottom safe area now that the content is top-aligned rather than centered.
  const contentTopOffset = Math.round(windowHeight * 0.06);

  // Cap the menu/picker so it fills down to the bottom safe area — no taller (it
  // would clip past it), no shorter (wasting vertical space) — and no lower than
  // the keyboard when one is up. Measure the preview's real height rather than
  // reserving a fixed guess; fall back to an estimate until the first layout. The
  // card scrolls internally past this cap.
  const [previewHeight, setPreviewHeight] = useState(0);
  const reservedForPreview = previewHeight > 0 ? previewHeight : artMaxSize + spacing[5] * 4;
  const bottomReserve = keyboardHeight > 0 ? keyboardHeight : insets.bottom + spacing[5];
  const menuMaxHeight = Math.max(
    180,
    windowHeight - insets.top - contentTopOffset - spacing[5] - reservedForPreview - bottomReserve,
  );

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const previewStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.9 + progress.value * 0.1 }],
  }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 18 }, { scale: 0.96 + progress.value * 0.04 }],
  }));

  const scrimColor = colorScheme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.35)';

  return (
    <OverlayPortal onRequestClose={handleRequestClose}>
      <View style={StyleSheet.absoluteFill}>
        {/* Blurred / dimmed backdrop. Tapping it pops the playlist view back to
            the menu first (matching the back button), and dismisses from the menu
            — so a stray tap can't tear down a half-typed create form. */}
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          {Platform.OS === 'ios' ? (
            <BlurView
              blurType={colorScheme === 'dark' ? 'dark' : 'light'}
              blurAmount={12}
              reducedTransparencyFallbackColor={scrimColor}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: scrimColor }]} />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleRequestClose}
            accessibilityRole="button"
            accessibilityLabel={climb.name}
          />
        </Animated.View>

        {/* Floating content: enlarged climb + action menu. box-none so empty space
            falls through to the backdrop Pressable. Plain View — the animated nodes
            are the inner preview and menu wrap. */}
        <View
          pointerEvents="box-none"
          // Contain VoiceOver focus to the floating content (don't let it wander into
          // the screen behind), and let the VO escape gesture pop the view / dismiss.
          accessibilityViewIsModal={Platform.OS === 'ios'}
          onAccessibilityEscape={handleRequestClose}
          style={[
            styles.content,
            { paddingTop: insets.top + contentTopOffset, paddingBottom: insets.bottom + spacing[5] },
          ]}
        >
          {/* The enlarged climb stays visible in both views — the playlist picker
              replaces the action list below it, not the climb itself. onLayout
              feeds the real preview height into the menu/picker cap. */}
          <Animated.View
            pointerEvents="box-none"
            onLayout={(event) => setPreviewHeight(event.nativeEvent.layout.height)}
            style={[styles.preview, previewStyle]}
          >
            {boardRenderData && artStyle ? (
              <BoardImageNative
                frames={climb.frames}
                boardName={boardConfig.boardName as BoardName}
                layoutId={boardConfig.layoutId}
                sizeId={boardConfig.sizeId}
                setIds={boardConfig.setIds}
                boardWidth={boardRenderData.boardWidth}
                boardHeight={boardRenderData.boardHeight}
                mirrored={climb.mirrored === true}
                filledStyle
                renderWidth={400}
                style={artStyle}
              />
            ) : null}
            <View style={styles.previewText}>
              <View style={styles.nameRow}>
                <Text variant="headline" numberOfLines={1} style={styles.name}>
                  {climb.name}
                </Text>
                <ClimbAttributeIcons
                  benchmarkDifficulty={climb.benchmark_difficulty}
                  characteristics={climb.characteristics}
                />
                {formattedGrade || climb.difficulty ? (
                  <Text variant="headline" numberOfLines={1} style={[styles.grade, { color: gradeColor }]}>
                    {formattedGrade ?? climb.difficulty}
                  </Text>
                ) : null}
              </View>
              {byline ? (
                <Text variant="footnote" numberOfLines={1} style={styles.byline}>
                  {byline}
                </Text>
              ) : null}
            </View>
          </Animated.View>

          <Animated.View style={[styles.menuWrap, menuStyle]}>
            <GlassSurface role="base" level="level2" borderRadius={borderRadius.xl} style={styles.menuCard}>
              {view === 'playlist' ? (
                // The picker pins its own header and scrolls the list within
                // menuMaxHeight, so "back" stays put however far you scroll.
                <InlinePlaylistPicker
                  climb={climb}
                  angle={boardConfig.angle}
                  boardName={boardConfig.boardName as BoardName}
                  layoutId={boardConfig.layoutId}
                  TextInputComponent={TextInput}
                  onBack={backToMenu}
                  maxHeight={menuMaxHeight}
                />
              ) : (
                <ScrollView
                  style={{ maxHeight: menuMaxHeight }}
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.menuContent}
                >
                  {actions.map((action, index) => (
                    <ListRow
                      key={action.id}
                      title={action.title}
                      leading={<Icon name={action.icon} size={22} color={action.color} />}
                      onPress={action.run}
                      showSeparator={index < actions.length - 1}
                      separatorInset={56}
                    />
                  ))}
                </ScrollView>
              )}
            </GlassSurface>
          </Animated.View>
        </View>
      </View>
    </OverlayPortal>
  );
}

const styles = StyleSheet.create({
  content: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    // Anchor from the top, not centered: the climb preview keeps a fixed position
    // whether the action list or the (shorter/taller) playlist picker sits below
    // it, so switching views never shifts the climb up or down.
    justifyContent: 'flex-start',
    paddingHorizontal: spacing[6],
    gap: spacing[5],
  },
  preview: {
    alignItems: 'center',
    gap: spacing[3],
    width: '100%',
    maxWidth: 320,
  },
  previewText: {
    alignItems: 'center',
    gap: 2,
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    width: '100%',
  },
  name: {
    fontWeight: '700',
    flexShrink: 1,
  },
  byline: {
    opacity: 0.6,
    textAlign: 'center',
  },
  grade: {
    fontWeight: '800',
  },
  menuWrap: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  menuCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  menuContent: {
    paddingVertical: spacing[1],
  },
});
