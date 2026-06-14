import { memo, useMemo, useState, useCallback, useRef, type ReactNode } from 'react';
import {
  FlatList,
  View,
  StyleSheet,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ColorValue,
} from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import type { BoardName, SessionFeedItem, SessionFeedTickHighlight, SocialEntityType } from '@boardsesh/shared-schema';
import { formatTickRelativeTime } from '@boardsesh/profile-stats';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { type IconName } from '../icon-map';
import { Card } from '../Card';
import { PressableSurface } from '../PressableSurface';
import { ClimbListThumbnail, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from '../ClimbListThumbnail';
import { AvatarGroup } from './AvatarGroup';
import { FeedSocialRow } from './FeedSocialRow';
import { StackedBarChart } from './YouCharts';
import { gradeBadgeColor, buildSessionGradeBars } from './profile-chart-colors';
import { isInstagramUrl, isTikTokUrl, mapBetaLink } from '../../lib/beta-video-url';
import { getBoardConfigForPlaylist } from '../../lib/playlists/board-details-for-playlist';
import { spacing, borderRadius, overlays } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { useReduceMotion } from '../../hooks/use-reduce-motion';
import { hapticLight } from '../../lib/haptics';

type SessionFeedCardProps = {
  session: SessionFeedItem;
  /** Per-viewer vote summary (count + userVote) for this session/tick, if loaded. */
  voteSummary?: { upvotes: number; userVote: number | null };
  onOpenComments: (entityId: string, entityType: SocialEntityType) => void;
  onPress: (session: SessionFeedItem) => void;
  onOpenClimb?: (tick: SessionFeedTickHighlight) => void;
};

type CardPage = { key: 'beta' } | { key: 'hardest' } | { key: 'chart' };

const CARD_BODY_HEIGHT = 188;
const PAGE_DOT_SIZE = 5;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function tickStatusLabel(status: string, t: (key: string) => string): string {
  if (status === 'flash') return t('sessionFeedCard.status.flash');
  if (status === 'send') return t('sessionFeedCard.status.send');
  if (status === 'attempt') return t('sessionFeedCard.status.attempt');
  return status;
}

function compactJoin(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => !!part).join(' · ');
}

function betaPlatform(url: string): { label: string; icon: IconName } | null {
  if (isInstagramUrl(url)) return { label: 'Instagram', icon: 'instagram' };
  if (isTikTokUrl(url)) return { label: 'TikTok', icon: 'tiktok' };
  return null;
}

export const SessionFeedCard = memo(function SessionFeedCard({
  session,
  voteSummary,
  onOpenComments,
  onPress,
  onOpenClimb,
}: SessionFeedCardProps) {
  const { t } = useTranslation('feed');
  const { systemColors, brandColors } = useTheme();
  const { formatGrade } = useGradeFormat();
  const reduceMotion = useReduceMotion();
  const pagerRef = useRef<FlatList<CardPage>>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const names = session.participants
    .map((participant) => participant.displayName)
    .filter((name): name is string => !!name)
    .join(', ');

  const gradeBars = useMemo(
    () => buildSessionGradeBars(session.gradeDistribution, formatGrade),
    [session.gradeDistribution, formatGrade],
  );

  const pages = useMemo<CardPage[]>(() => {
    const nextPages: CardPage[] = [];
    if (session.hardestSend) nextPages.push({ key: 'hardest' });
    if (session.featuredBeta) nextPages.push({ key: 'beta' });
    nextPages.push({ key: 'chart' });
    return nextPages;
  }, [session.featuredBeta, session.hardestSend]);

  const visibleActivePageIndex = Math.min(activePageIndex, Math.max(pages.length - 1, 0));
  const displayHardestGrade = session.hardestGrade ? (formatGrade(session.hardestGrade) ?? session.hardestGrade) : null;
  const boardSummary = session.boardTypes.length > 0 ? session.boardTypes.join(' · ') : null;
  const metaLine = compactJoin([
    formatTickRelativeTime(session.lastTickAt),
    session.durationMinutes != null && session.durationMinutes > 0 ? formatDuration(session.durationMinutes) : null,
    boardSummary,
    t('sessionFeedCard.climbCount', { count: session.tickCount }),
  ]);
  const statsLine = compactJoin([
    t('sessionFeedCard.sendsCount', { count: session.totalSends }),
    displayHardestGrade ? t('sessionFeedCard.hardestGrade', { grade: displayHardestGrade }) : null,
    session.totalFlashes > 0 ? t('sessionFeedCard.flashesCount', { count: session.totalFlashes }) : null,
    session.totalAttempts > 0 ? t('sessionFeedCard.attempts', { count: session.totalAttempts }) : null,
  ]);
  const activePage = pages[visibleActivePageIndex];
  let activePageLabel = t('sessionFeedCard.chartLabel');
  if (activePage?.key === 'hardest') {
    activePageLabel = compactJoin([t('sessionFeedCard.hardestSend'), session.hardestSend?.climbName ?? undefined]);
  } else if (activePage?.key === 'beta') {
    activePageLabel = t('sessionFeedCard.betaCaption');
  }
  const accessibilityLabel = compactJoin([
    names || t('sessionFeedCard.climbCount', { count: session.tickCount }),
    metaLine,
    statsLine,
    activePageLabel,
  ]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setPageWidth(event.nativeEvent.layout.width);
  }, []);

  const scrollToPage = useCallback(
    (nextPageIndex: number) => {
      const boundedIndex = Math.max(0, Math.min(nextPageIndex, pages.length - 1));
      setActivePageIndex(boundedIndex);
      if (pageWidth > 0) {
        pagerRef.current?.scrollToIndex({ index: boundedIndex, animated: !reduceMotion });
      }
    },
    [pageWidth, pages.length, reduceMotion],
  );

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) return;
      setActivePageIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
    },
    [pageWidth],
  );

  const handleCardPress = useCallback(() => {
    hapticLight();
    onPress(session);
  }, [onPress, session]);

  const handleHardestSendPress = useCallback(
    (tick: SessionFeedTickHighlight) => {
      if (!onOpenClimb) {
        handleCardPress();
        return;
      }
      hapticLight();
      onOpenClimb(tick);
    },
    [handleCardPress, onOpenClimb],
  );

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'increment') {
        scrollToPage(visibleActivePageIndex + 1);
        return;
      }
      if (event.nativeEvent.actionName === 'decrement') {
        scrollToPage(visibleActivePageIndex - 1);
      }
    },
    [scrollToPage, visibleActivePageIndex],
  );

  const renderPage = useCallback(
    ({ item }: ListRenderItemInfo<CardPage>) => {
      if (item.key === 'beta') {
        return (
          <SessionCardPage
            width={pageWidth}
            onPress={handleCardPress}
            accessibilityLabel={t('sessionFeedCard.openSessionPage')}
          >
            <BetaPage session={session} />
          </SessionCardPage>
        );
      }
      if (item.key === 'hardest') {
        const hardestSend = session.hardestSend;
        return (
          <SessionCardPage width={pageWidth}>
            <HardestSendPage
              tick={hardestSend}
              onPress={hardestSend ? () => handleHardestSendPress(hardestSend) : undefined}
            />
          </SessionCardPage>
        );
      }
      return (
        <SessionCardPage
          width={pageWidth}
          onPress={handleCardPress}
          accessibilityLabel={t('sessionFeedCard.openSessionPage')}
        >
          <ChartPage gradeBars={gradeBars} />
        </SessionCardPage>
      );
    },
    [gradeBars, handleCardPress, handleHardestSendPress, pageWidth, session, t],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<CardPage> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  const carouselAccessibilityActions =
    pages.length > 1
      ? [
          { name: 'decrement', label: t('sessionFeedCard.previousPage') },
          { name: 'increment', label: t('sessionFeedCard.nextPage') },
        ]
      : undefined;

  return (
    <View style={styles.wrapper}>
      <Card>
        <PressableSurface
          onPress={handleCardPress}
          feedback="opacity"
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={t('sessionFeedCard.openHint')}
          style={styles.summaryPressable}
        >
          <View style={styles.header}>
            <AvatarGroup participants={session.participants} size={32} />
            <View style={styles.headerText}>
              <Text variant="subheadline" style={styles.names} numberOfLines={1}>
                {names || t('sessionFeedCard.climbCount', { count: session.tickCount })}
              </Text>
              <Text variant="caption1" color={systemColors.tertiaryLabel} numberOfLines={1} style={styles.metaLine}>
                {metaLine}
              </Text>
            </View>
          </View>

          <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1} style={styles.statsLine}>
            {statsLine}
          </Text>

          {session.goal ? (
            <View style={styles.goal}>
              <Icon name="flag" size={13} color={systemColors.secondaryLabel} />
              <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={2} style={styles.flex}>
                {session.goal}
              </Text>
            </View>
          ) : null}
        </PressableSurface>

        <View
          style={styles.pager}
          onLayout={handleLayout}
          accessible={pages.length > 1}
          accessibilityRole={pages.length > 1 ? 'adjustable' : undefined}
          accessibilityLabel={t('sessionFeedCard.pageIndicator', {
            current: visibleActivePageIndex + 1,
            total: pages.length,
          })}
          accessibilityActions={carouselAccessibilityActions}
          onAccessibilityAction={handleAccessibilityAction}
        >
          {pageWidth > 0 ? (
            <FlatList
              ref={pagerRef}
              data={pages}
              renderItem={renderPage}
              keyExtractor={(page) => page.key}
              horizontal
              pagingEnabled
              directionalLockEnabled
              scrollEnabled={pages.length > 1}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleMomentumEnd}
              getItemLayout={getItemLayout}
              bounces={false}
            />
          ) : (
            <View style={styles.pagePlaceholder} />
          )}
        </View>

        {pages.length > 1 ? (
          <SessionPageDots
            total={pages.length}
            activeIndex={visibleActivePageIndex}
            activeColor={brandColors.primary}
            inactiveColor={systemColors.separator}
          />
        ) : null}

        <View style={[styles.socialFooter, { borderTopColor: systemColors.separator }]}>
          <FeedSocialRow
            entityId={session.socialEntityId}
            entityType={session.socialEntityType}
            upvotes={voteSummary?.upvotes ?? session.upvotes}
            userVote={voteSummary?.userVote ?? null}
            commentCount={session.commentCount}
            onOpenComments={(entityId) => onOpenComments(entityId, session.socialEntityType)}
          />
        </View>
      </Card>
    </View>
  );
});

function SessionCardPage({
  width,
  children,
  onPress,
  accessibilityLabel,
}: {
  width: number;
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (onPress) {
    return (
      <PressableSurface
        onPress={onPress}
        feedback="opacity"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.page, { width }]}
      >
        {children}
      </PressableSurface>
    );
  }

  return <View style={[styles.page, { width }]}>{children}</View>;
}

function BetaPage({ session }: { session: SessionFeedItem }) {
  const { t } = useTranslation('feed');
  const { systemColors } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const betaLink = session.featuredBeta ? mapBetaLink(session.featuredBeta.betaLink) : null;
  if (!betaLink) return null;

  const platform = betaPlatform(betaLink.link);
  const username = betaLink.foreign_username?.trim();
  const climbName = session.featuredBeta?.tick.climbName ?? t('sessionFeedCard.unknownClimb');
  const betaMeta = compactJoin([platform?.label, username ? `@${username}` : null]);

  return (
    <View style={styles.betaPage}>
      <View style={[styles.betaPreviewImage, { backgroundColor: systemColors.fill }]}>
        {betaLink.thumbnail && !imageFailed ? (
          <Image
            source={{ uri: betaLink.thumbnail }}
            style={styles.betaThumbnail}
            contentFit="cover"
            transition={150}
            recyclingKey={betaLink.thumbnail}
            onError={() => setImageFailed(true)}
            accessibilityIgnoresInvertColors
            allowDownscaling={false}
          />
        ) : (
          <Icon name="video" size={22} color={systemColors.tertiaryLabel} />
        )}
        {platform ? (
          <View style={styles.betaPlatform}>
            <Icon name={platform.icon} size={11} color={overlays.onScrim} />
          </View>
        ) : null}
      </View>
      <View style={styles.betaDetails}>
        <Text variant="caption1" color={systemColors.secondaryLabel}>
          {t('sessionFeedCard.betaCaption')}
        </Text>
        <Text variant="headline" numberOfLines={2}>
          {climbName}
        </Text>
        {betaMeta ? (
          <Text variant="footnote" color={systemColors.tertiaryLabel} numberOfLines={1}>
            {betaMeta}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function HardestSendPage({
  tick,
  onPress,
}: {
  tick: SessionFeedTickHighlight | null | undefined;
  onPress?: () => void;
}) {
  const { t } = useTranslation('feed');
  const { systemColors, brandColors } = useTheme();
  const { formatGrade } = useGradeFormat();
  if (!tick) return null;

  const boardConfig = getBoardConfigForPlaylist(tick.boardType, tick.layoutId);
  const displayGrade = tick.difficultyName ? (formatGrade(tick.difficultyName) ?? tick.difficultyName) : null;
  const statusLabel = tickStatusLabel(tick.status, t);
  const statusIcon: IconName = tick.status === 'flash' ? 'flash' : 'check.small';
  const attemptLabel = tick.attemptCount > 1 ? t('sessionFeedCard.attempts', { count: tick.attemptCount }) : null;

  const content = (
    <View style={styles.hardestPage}>
      {boardConfig && tick.frames ? (
        <ClimbListThumbnail
          frames={tick.frames}
          boardName={boardConfig.boardName as BoardName}
          layoutId={boardConfig.layoutId}
          sizeId={boardConfig.sizeId}
          setIds={boardConfig.setIds.join(',')}
          mirrored={tick.isMirror}
        />
      ) : (
        <View style={[styles.thumbnailFallback, { backgroundColor: systemColors.fill }]}>
          <Icon name="lightbulb" size={24} color={systemColors.tertiaryLabel} />
        </View>
      )}
      <View style={styles.hardestDetails}>
        <Text variant="caption1" color={systemColors.secondaryLabel}>
          {t('sessionFeedCard.hardestSend')}
        </Text>
        <Text variant="headline" numberOfLines={2}>
          {tick.climbName ?? t('sessionFeedCard.unknownClimb')}
        </Text>
        <View style={styles.inlineMeta}>
          {displayGrade ? (
            <Text
              variant="footnote"
              color={gradeBadgeColor(tick.difficultyName ?? displayGrade)}
              style={styles.gradeText}
            >
              {displayGrade}
            </Text>
          ) : null}
          {displayGrade ? <MetaSeparator /> : null}
          <View style={styles.statusMeta}>
            <Icon name={statusIcon} size={12} color={brandColors.success} />
            <Text variant="footnote" color={brandColors.success}>
              {statusLabel}
            </Text>
          </View>
          {attemptLabel ? <MetaSeparator /> : null}
          {attemptLabel ? (
            <Text variant="footnote" color={systemColors.secondaryLabel}>
              {attemptLabel}
            </Text>
          ) : null}
        </View>
        {tick.comment ? (
          <Text variant="subheadline" color={systemColors.secondaryLabel} numberOfLines={3} style={styles.quote}>
            {tick.comment}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <PressableSurface
      onPress={onPress}
      feedback="opacity"
      accessibilityRole="button"
      accessibilityLabel={t('sessionFeedCard.openHardestClimb', {
        climb: tick.climbName ?? t('sessionFeedCard.unknownClimb'),
      })}
      style={styles.hardestPressable}
    >
      {content}
    </PressableSurface>
  );
}

function ChartPage({ gradeBars }: { gradeBars: ReturnType<typeof buildSessionGradeBars> }) {
  const { t } = useTranslation('feed');
  return (
    <View pointerEvents="none" style={styles.chartPage}>
      <StackedBarChart
        bars={gradeBars}
        colorBy="grade"
        height={132}
        fitYAxisToData
        interactive={false}
        zoomable={false}
        emptyLabel={t('sessionFeedCard.chartEmpty')}
      />
    </View>
  );
}

function MetaSeparator() {
  const { systemColors } = useTheme();
  return (
    <Text variant="footnote" color={systemColors.tertiaryLabel}>
      ·
    </Text>
  );
}

function SessionPageDots({
  total,
  activeIndex,
  activeColor,
  inactiveColor,
}: {
  total: number;
  activeIndex: number;
  activeColor: ColorValue;
  inactiveColor: ColorValue;
}) {
  const { t } = useTranslation('feed');
  return (
    <View
      style={styles.dots}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('sessionFeedCard.pageIndicator', { current: activeIndex + 1, total })}
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          importantForAccessibility="no"
          style={[
            styles.dot,
            { backgroundColor: index === activeIndex ? activeColor : inactiveColor },
            index === activeIndex ? styles.dotActive : null,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: spacing[4], marginTop: spacing[3] },
  summaryPressable: {
    margin: -spacing[1],
    padding: spacing[1],
    borderRadius: borderRadius.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  headerText: { flex: 1 },
  names: { fontWeight: '600' },
  metaLine: { marginTop: 2 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  statsLine: { marginTop: spacing[2], fontWeight: '600' },
  pager: { minHeight: CARD_BODY_HEIGHT, marginTop: spacing[3] },
  pagePlaceholder: { height: CARD_BODY_HEIGHT },
  page: { minHeight: CARD_BODY_HEIGHT, justifyContent: 'center' },
  betaPage: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  betaPreviewImage: {
    width: 68,
    height: 88,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  betaThumbnail: {
    width: '100%',
    height: '100%',
  },
  betaPlatform: {
    position: 'absolute',
    top: spacing[1],
    left: spacing[1],
    width: 22,
    height: 22,
    borderRadius: borderRadius.full,
    backgroundColor: overlays.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  betaDetails: { flex: 1, gap: spacing[1] },
  hardestPressable: {
    borderRadius: borderRadius.md,
  },
  hardestPage: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  thumbnailFallback: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hardestDetails: { flex: 1, gap: spacing[2] },
  inlineMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[1] },
  gradeText: { fontWeight: '700' },
  statusMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  quote: { marginTop: spacing[1] },
  chartPage: { minHeight: CARD_BODY_HEIGHT, justifyContent: 'center' },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    marginTop: spacing[1],
  },
  dot: {
    width: PAGE_DOT_SIZE,
    height: PAGE_DOT_SIZE,
    borderRadius: PAGE_DOT_SIZE / 2,
  },
  dotActive: {
    width: PAGE_DOT_SIZE * 2.2,
  },
  socialFooter: {
    marginTop: spacing[3],
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
});
