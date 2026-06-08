import { type ReactNode, useCallback, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
  StyleSheet,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import type { BoardName, Climb as SchemaClimb } from '@boardsesh/shared-schema';
import type { Climb } from '@boardsesh/queue';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ActivityIndicator } from '../ActivityIndicator';
import { ClimbListRow } from '../ClimbListRow';
import { GlassIconButton } from '../GlassIconButton';
import { PlaylistBoardBackdrop } from './PlaylistBoardBackdrop';
import { buildHeroGradient, shiftLightness } from './playlist-gradient';
import { PLAYLIST_COLORS, isValidHexColor } from './playlist-colors';
import { withAlpha } from '../../theme/colors';
import { toQueueClimb, toSchemaClimb } from '../../lib/climb-types';
import { useDrawerHost } from '../../providers/drawer-host-provider';
import { useTheme } from '../../providers/theme-provider';
import { useBottomChromeMetrics } from '../../hooks/use-bottom-chrome-metrics';
import { glassSize } from '../../theme/layout';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing, borderRadius } from '../../theme/tokens';

/** Bottom scrim that keeps white title/meta legible across the palette (amber
 *  and green included) without per-colour luminance branching. */
const HERO_SCRIM_COLORS = ['transparent', 'transparent', 'rgba(0, 0, 0, 0.28)'] as const;
const HERO_SCRIM_LOCATIONS = [0, 0.45, 1] as const;
const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 1, y: 1 } as const;
/** Nav-bar height (below the status-bar inset) for the collapsed header — tall
 *  enough to contain the floating FABs (which sit `spacing[1]` below the inset),
 *  so they're centered in the bar rather than poking out under it. */
const NAV_BAR_HEIGHT = glassSize.standard + spacing[1] * 2;

export type PlaylistDetailHero = {
  name: string;
  climbCount: number;
  color?: string;
  icon?: string;
  /** Playlist description, shown under the hero row. */
  description?: string;
  /** Secondary line under the climb count (e.g. the smart-playlist creator). */
  subtitle?: string;
  /** Already-translated follower-count line (public playlists). */
  followerLabel?: string;
  /** Board for the optional frosted board backdrop behind the hero square. */
  boardType?: string;
  layoutId?: number | null;
  showBoardBackdrop?: boolean;
};

export type PlaylistDetailViewProps = {
  hero: PlaylistDetailHero;
  climbs: Climb[];
  /** True while the first page loads (hero still renders; list shows a spinner). */
  isLoading: boolean;
  /** True while a subsequent page loads (trailing spinner). */
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  /** Activate a tapped climb (wires the queue + opens the play drawer). */
  onActivateClimb: (climb: Climb) => void;
  /** Already-resolved empty-list copy (callers translate with a static key). */
  emptyMessage: string;
  /** Floating top-right controls (follow / pin / more) over the hero, given the
   *  current collapse state so a control can swap to its compact icon form once
   *  the colour header bar takes over. The back FAB on the left is always
   *  rendered; absent here = a back-only top bar. */
  actions?: (collapsed: boolean) => ReactNode;
};

/**
 * Shared hero + paginated climb list for the playlist-detail and
 * smart-playlist-detail screens. Renders the colour/emoji hero, then a FlashList
 * of `ClimbListRow`s bound to the user's active board, paginating via
 * `fetchNextPage` as the list nears its end.
 */
export function PlaylistDetailView({
  hero,
  climbs,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  onActivateClimb,
  emptyMessage,
  actions,
}: PlaylistDetailViewProps) {
  const { t } = useTranslation('playlists');
  const { t: tCommon } = useTranslation('common');
  const { systemColors } = useTheme();
  const { boardConfig } = useDrawerHost();
  const bottomChrome = useBottomChromeMetrics();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listPaddingBottom = bottomChrome.scrollBottomPadding;

  // Scroll offset + measured hero-banner height drive the collapsed colour header
  // bar (the playlist colour + centered name) that fades in once the hero scrolls
  // off the top — the Apple Music album-header idiom.
  const scrollY = useSharedValue(0);
  const heroBannerHeight = useSharedValue(0);
  const headerBarHeight = insets.top + NAV_BAR_HEIGHT;
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.value = event.nativeEvent.contentOffset.y;
    },
    [scrollY],
  );
  const handleHeroLayout = useCallback(
    (event: LayoutChangeEvent) => {
      heroBannerHeight.value = event.nativeEvent.layout.height;
    },
    [heroBannerHeight],
  );
  const headerBarStyle = useAnimatedStyle(() => {
    const banner = heroBannerHeight.value;
    if (banner <= 0) return { opacity: 0 };
    // Fully opaque once the banner's bottom edge reaches the bar's bottom.
    const threshold = Math.max(1, banner - headerBarHeight);
    return { opacity: interpolate(scrollY.value, [threshold - 24, threshold], [0, 1], Extrapolation.CLAMP) };
  });

  // `collapsed` flips when the colour header bar takes over, so action FABs (e.g.
  // follow) can swap to their compact icon form.
  const [collapsed, setCollapsed] = useState(false);
  useAnimatedReaction(
    () => {
      const banner = heroBannerHeight.value;
      return banner > 0 && scrollY.value >= banner - headerBarHeight;
    },
    (isCollapsed, wasCollapsed) => {
      if (isCollapsed !== wasCollapsed) runOnJS(setCollapsed)(isCollapsed);
    },
  );
  const actionNode = actions?.(collapsed);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Stable per-row activate handler so the memoized `ClimbListRow`s aren't handed
  // a fresh closure each render — every renderItem rebuild (e.g. when the sticky
  // header `collapsed` flips during scroll) would otherwise re-render every row.
  const handleActivate = useCallback((tapped: SchemaClimb) => onActivateClimb(toQueueClimb(tapped)), [onActivateClimb]);

  const renderItem = useCallback(
    ({ item }: { item: Climb }) => {
      if (!boardConfig) return null;
      return (
        <ClimbListRow
          climb={toSchemaClimb(item)}
          boardName={boardConfig.boardName as BoardName}
          layoutId={boardConfig.layoutId}
          sizeId={boardConfig.sizeId}
          setIds={boardConfig.setIds}
          angle={boardConfig.angle}
          onPress={handleActivate}
        />
      );
    },
    [boardConfig, handleActivate],
  );

  const baseColor = hero.color && isValidHexColor(hero.color) ? hero.color : PLAYLIST_COLORS[0];
  // The collapsed bar uses the gradient's deeper tone so white text stays legible.
  const headerColor = shiftLightness(baseColor, -20);
  const gradient = buildHeroGradient(hero.color);
  const showBackdrop = !!(hero.showBoardBackdrop && hero.boardType);
  // With the board backdrop on, drop the gradient to a translucent wash so the
  // blurred board ghosts through; otherwise it's the opaque colour banner.
  const gradientColors = showBackdrop
    ? ([
        withAlpha(gradient.colors[0], 0.82),
        withAlpha(gradient.colors[1], 0.82),
        withAlpha(gradient.colors[2], 0.82),
      ] as [string, string, string])
    : gradient.colors;

  const header = (
    <View style={styles.hero}>
      {/* Full-bleed colour banner running up under the (transparent) header,
          replacing the small colour square. White text + a bottom scrim keep it
          legible across every palette colour and arbitrary user hex. */}
      {/* Clear the floating back + action FABs that sit over the banner top. */}
      <View
        onLayout={handleHeroLayout}
        style={[styles.heroBanner, { paddingTop: insets.top + spacing[12] + spacing[2], backgroundColor: baseColor }]}
      >
        {showBackdrop && hero.boardType ? (
          <PlaylistBoardBackdrop boardType={hero.boardType} layoutId={hero.layoutId} />
        ) : null}
        <LinearGradient
          pointerEvents="none"
          colors={gradientColors}
          locations={gradient.locations}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          pointerEvents="none"
          colors={HERO_SCRIM_COLORS}
          locations={HERO_SCRIM_LOCATIONS}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroBannerContent}>
          {hero.icon ? (
            <Text style={styles.heroEmoji} allowFontScaling={false}>
              {hero.icon}
            </Text>
          ) : (
            <Icon name="tag" size={40} color={iosSystemColors.white} />
          )}
          <Text variant="title2" numberOfLines={2} color={iosSystemColors.white} style={styles.heroName}>
            {hero.name}
          </Text>
          <Text variant="subheadline" color={iosSystemColors.white} style={styles.heroBannerMeta}>
            {t('detail.climbCount', { count: hero.climbCount })}
          </Text>
          {hero.followerLabel ? (
            <Text variant="footnote" color={iosSystemColors.white} style={styles.heroBannerMeta}>
              {hero.followerLabel}
            </Text>
          ) : null}
        </View>
      </View>
      {hero.description || hero.subtitle ? (
        <View style={styles.heroBelow}>
          {hero.description ? (
            <Text variant="footnote" numberOfLines={3} style={styles.heroDescription}>
              {hero.description}
            </Text>
          ) : null}
          {hero.subtitle ? (
            <Text variant="footnote" numberOfLines={1} style={styles.heroSubtitle}>
              {hero.subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Paints the status-bar / dynamic-island strip in the playlist colour so it
          is never the bare screen background — even on the first frame before the
          list lays its full-bleed hero out behind the island. */}
      <View pointerEvents="none" style={[styles.islandFill, { height: insets.top, backgroundColor: baseColor }]} />
      <FlashList
        data={climbs}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        // The hero banner is full-bleed and runs up behind the status bar / dynamic
        // island, owning the top inset itself (paddingTop above). Both props are
        // needed so iOS doesn't inset the content down on the first frame (which
        // would briefly expose the screen background behind the island).
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{ paddingBottom: listPaddingBottom }}
        ListHeaderComponent={header}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="large" />
            </View>
          ) : (
            <View style={styles.stateContainer}>
              <Icon name="playlist" size={44} color={iosSystemColors.systemGray4} />
              <Text variant="subheadline" style={styles.emptyText}>
                {emptyMessage}
              </Text>
            </View>
          )
        }
      />

      {/* Collapsed colour header bar — the playlist colour + centered name, fading
          in once the hero scrolls off. Sits below the floating FABs. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.headerBar,
          { height: headerBarHeight, paddingTop: insets.top, backgroundColor: headerColor },
          headerBarStyle,
        ]}
      >
        <View style={styles.headerBarRow}>
          <Text variant="headline" numberOfLines={1} color={iosSystemColors.white} style={styles.headerBarTitle}>
            {hero.name}
          </Text>
        </View>
      </Animated.View>

      {/* Floating top bar over the gradient hero — replaces the native header.
          Back chevron on the left, optional follow/pin/more on the right. */}
      <View pointerEvents="box-none" style={[styles.topBar, { paddingTop: insets.top + spacing[1] }]}>
        <GlassIconButton
          iconName="back"
          iconColor={systemColors.label}
          onPress={() => router.back()}
          accessibilityLabel={tCommon('ariaLabels.back')}
          fallbackColor={systemColors.fill}
        />
        {actionNode ? (
          <View pointerEvents="box-none" style={styles.topBarActions}>
            {actionNode}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function keyExtractor(item: Climb) {
  return item.uuid;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  islandFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.15)',
  },
  headerBarRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Keep the centered name clear of the back / action FABs at the edges.
    paddingHorizontal: 64,
  },
  headerBarTitle: {
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  hero: {
    marginBottom: spacing[2],
  },
  heroBanner: {
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    overflow: 'hidden',
    paddingBottom: spacing[5],
  },
  heroBannerContent: {
    paddingHorizontal: spacing[4],
  },
  heroEmoji: {
    fontSize: 52,
    lineHeight: 60,
    marginBottom: spacing[2],
  },
  heroName: {
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroBannerMeta: {
    marginTop: 2,
    opacity: 0.85,
  },
  heroBelow: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[5],
    gap: 2,
  },
  heroSubtitle: {
    opacity: 0.5,
  },
  heroDescription: {
    opacity: 0.7,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyText: {
    opacity: 0.5,
    textAlign: 'center',
  },
});
