import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type BottomSheet from '@gorhom/bottom-sheet';
import type { ActivityFeedItem, SocialEntityType } from '@boardsesh/shared-schema';
import { betaLinkIdentity, isInstagramUrl, isTikTokUrl, type BoardName } from '@boardsesh/shared-schema';
import { Text } from '../../../src/components/Text';
import { Icon } from '../../../src/components/Icon';
import type { IconName } from '../../../src/components/icon-map';
import { Avatar } from '../../../src/components/Avatar';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { ClimbListThumbnail } from '../../../src/components/ClimbListThumbnail';
import { FeedSocialRow } from '../../../src/components/you/FeedSocialRow';
import { CommentSheet } from '../../../src/components/you/CommentSheet';
import {
  useActivityFeed,
  useChunkedBulkVoteSummaries,
  useRecentBetaLinks,
  type RecentBetaVideo,
} from '../../../src/lib/graphql/hooks';
import { useAuth } from '../../../src/providers/auth-provider';
import { useTheme } from '../../../src/providers/theme-provider';
import { useToast } from '../../../src/providers/toast-provider';
import { useBottomChromeMetrics } from '../../../src/hooks/use-bottom-chrome-metrics';
import { getBoardConfigForPlaylist } from '../../../src/lib/playlists/board-details-for-playlist';
import { formatRelativeTime } from '../../../src/lib/format-relative-time';
import { hapticLight } from '../../../src/lib/haptics';
import { iosSystemColors } from '../../../src/theme/ios-colors';
import { borderRadius, spacing } from '../../../src/theme/tokens';
import { BETA_CARD_HEIGHT, BETA_CARD_WIDTH } from '../../../src/components/play-drawer/BetaVideoCard';

const RECENT_BETA_LIMIT = 20;
const SHELF_GAP = spacing[3];
const INITIAL_FEED_SKELETON_KEYS = ['home-feed-skeleton-1', 'home-feed-skeleton-2', 'home-feed-skeleton-3'];
const NEXT_PAGE_FEED_SKELETON_KEYS = ['home-feed-footer-skeleton-1', 'home-feed-footer-skeleton-2'];

type CommentTarget = {
  entityId: string;
  entityType: SocialEntityType;
};

type VoteSummary = {
  upvotes: number;
  userVote: number | null;
};

type AppRouter = ReturnType<typeof useRouter>;

type ActivityEntitySummaryMap = {
  ticks: Map<string, VoteSummary>;
  climbs: Map<string, VoteSummary>;
};

function navigateToClimb(
  router: AppRouter,
  climbUuid: string | null | undefined,
  boardType: string | null | undefined,
  layoutId: number | null | undefined,
  angle: number | null | undefined,
): void {
  if (!climbUuid || !boardType || angle == null) return;
  const boardConfig = getBoardConfigForPlaylist(boardType, layoutId);
  if (!boardConfig) return;

  router.push({
    pathname: '/(tabs)/climbs/[climbUuid]',
    params: {
      climbUuid,
      boardName: boardConfig.boardName,
      layoutId: String(boardConfig.layoutId),
      sizeId: String(boardConfig.sizeId),
      setIds: boardConfig.setIds.join(','),
      angle: String(angle),
    },
  });
}

function displayBoardName(boardType: string | null | undefined, t: TFunction<'feed'>): string | null {
  if (boardType === 'kilter') return t('mobile.home.boards.kilter');
  if (boardType === 'tension') return t('mobile.home.boards.tension');
  if (boardType === 'moonboard') return t('mobile.home.boards.moonboard');
  return null;
}

function getSummaryForItem(item: ActivityFeedItem, summaries: ActivityEntitySummaryMap): VoteSummary | undefined {
  if (item.entityType === 'tick') return summaries.ticks.get(item.entityId);
  if (item.entityType === 'climb') return summaries.climbs.get(item.entityId);
  return undefined;
}

function detectPlatform(url: string): { name: 'instagram' | 'tiktok'; icon: IconName } | null {
  if (isInstagramUrl(url)) return { name: 'instagram', icon: 'instagram' };
  if (isTikTokUrl(url)) return { name: 'tiktok', icon: 'tiktok' };
  return null;
}

function useActivitySummaries(items: ActivityFeedItem[], enabled: boolean): ActivityEntitySummaryMap {
  const tickEntityIds = useMemo(
    () =>
      items
        .filter((item) => item.entityType === 'tick')
        .map((item) => item.entityId)
        .filter((entityId, index, allEntityIds) => allEntityIds.indexOf(entityId) === index),
    [items],
  );
  const climbEntityIds = useMemo(
    () =>
      items
        .filter((item) => item.entityType === 'climb')
        .map((item) => item.entityId)
        .filter((entityId, index, allEntityIds) => allEntityIds.indexOf(entityId) === index),
    [items],
  );

  const tickSummaries = useChunkedBulkVoteSummaries('tick', tickEntityIds, enabled && tickEntityIds.length > 0);
  const climbSummaries = useChunkedBulkVoteSummaries('climb', climbEntityIds, enabled && climbEntityIds.length > 0);

  return useMemo(() => {
    const ticks = new Map<string, VoteSummary>();
    const climbs = new Map<string, VoteSummary>();

    for (const summary of tickSummaries) {
      ticks.set(summary.entityId, { upvotes: summary.upvotes, userVote: summary.userVote });
    }
    for (const summary of climbSummaries) {
      climbs.set(summary.entityId, { upvotes: summary.upvotes, userVote: summary.userVote });
    }

    return { ticks, climbs };
  }, [tickSummaries, climbSummaries]);
}

export default function HomeTab() {
  const { t } = useTranslation('feed');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { systemColors, brandColors } = useTheme();
  const bottomChrome = useBottomChromeMetrics();
  const listRef = useRef<FlashListRef<ActivityFeedItem>>(null);
  const commentSheetRef = useRef<BottomSheet | null>(null);
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);

  const betaVideos = useRecentBetaLinks(RECENT_BETA_LIMIT);
  const feed = useActivityFeed(undefined, isAuthenticated);

  const activityItems = useMemo(() => {
    const seenIds = new Set<string>();
    const dedupedItems: ActivityFeedItem[] = [];
    for (const item of feed.data?.pages.flatMap((page) => page.activityFeed.items) ?? []) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      dedupedItems.push(item);
    }
    return dedupedItems;
  }, [feed.data]);

  const summaries = useActivitySummaries(activityItems, isAuthenticated);

  const handleOpenComments = useCallback((entityId: string, entityType: SocialEntityType) => {
    setCommentTarget({ entityId, entityType });
    commentSheetRef.current?.snapToIndex(0);
  }, []);

  const handleEndReached = useCallback(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }, [feed]);

  const handleRefresh = useCallback(() => {
    void betaVideos.refetch();
    void queryClient.invalidateQueries({ queryKey: ['bulkVoteSummaries'] });
    if (isAuthenticated) void feed.refetch();
  }, [betaVideos, feed, isAuthenticated, queryClient]);

  const renderItem = useCallback(
    ({ item }: { item: ActivityFeedItem }) => (
      <ActivityCard
        item={item}
        summaries={summaries}
        onOpenComments={handleOpenComments}
        onOpenClimb={(feedItem) =>
          navigateToClimb(router, feedItem.climbUuid, feedItem.boardType, feedItem.layoutId, feedItem.angle)
        }
      />
    ),
    [handleOpenComments, router, summaries],
  );

  const header = useMemo(
    () => (
      <View style={styles.header}>
        <Text variant="largeTitle" style={styles.screenTitle}>
          {t('mobile.home.title')}
        </Text>
        <RecentBetaShelf
          videos={betaVideos.data ?? []}
          isLoading={betaVideos.isLoading}
          isError={betaVideos.isError}
          onRetry={() => void betaVideos.refetch()}
          onOpenClimb={(video) =>
            navigateToClimb(router, video.betaLink.climb_uuid, video.boardType, video.layoutId, video.betaLink.angle)
          }
        />
        <Text variant="title3" style={styles.feedHeading}>
          {t('mobile.home.feedTitle')}
        </Text>
      </View>
    ),
    [betaVideos.data, betaVideos.isError, betaVideos.isLoading, betaVideos.refetch, router, t],
  );

  if (!isAuthenticated) {
    return (
      <View style={[styles.centered, { backgroundColor: systemColors.background }]}>
        <Icon name="people" size={48} color={systemColors.tertiaryLabel} />
        <Text variant="headline" style={styles.emptyTitle}>
          {t('mobile.home.signInTitle')}
        </Text>
        <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.emptyBody}>
          {t('mobile.home.signInBody')}
        </Text>
        <View style={styles.emptyCta}>
          <Button title={tCommon('userDrawer.signIn')} onPress={() => router.push('/auth/login')} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: systemColors.background }]}>
      <FlashList
        ref={listRef}
        data={activityItems}
        extraData={summaries}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: bottomChrome.scrollBottomPadding + spacing[5] }}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={betaVideos.isRefetching || feed.isRefetching}
            onRefresh={handleRefresh}
            tintColor={brandColors.primary}
          />
        }
        ListEmptyComponent={
          feed.isLoading ? (
            <ActivitySkeletonList skeletonKeys={INITIAL_FEED_SKELETON_KEYS} />
          ) : feed.isError ? (
            <View style={styles.feedState}>
              <Icon name="error" size={32} color={iosSystemColors.systemRed} />
              <Text variant="headline" style={styles.emptyTitle}>
                {t('errors.loadActivity')}
              </Text>
              <View style={styles.emptyCta}>
                <Button title={tCommon('actions.retry')} onPress={() => void feed.refetch()} />
              </View>
            </View>
          ) : (
            <View style={styles.feedState}>
              <Icon name="people" size={48} color={systemColors.tertiaryLabel} />
              <Text variant="headline" style={styles.emptyTitle}>
                {t('mobile.home.emptyTitle')}
              </Text>
              <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.emptyBody}>
                {t('mobile.home.emptyBody')}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? <ActivitySkeletonList skeletonKeys={NEXT_PAGE_FEED_SKELETON_KEYS} /> : null
        }
      />
      <CommentSheet
        sheetRef={commentSheetRef}
        entityId={commentTarget?.entityId ?? null}
        entityType={commentTarget?.entityType ?? 'tick'}
        onClose={() => setCommentTarget(null)}
      />
    </View>
  );
}

function ActivitySkeletonList({ skeletonKeys }: { skeletonKeys: string[] }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {skeletonKeys.map((skeletonKey) => (
        <ActivityCardSkeleton key={skeletonKey} />
      ))}
    </View>
  );
}

function ActivityCardSkeleton() {
  const { systemColors } = useTheme();
  const blockStyle = { backgroundColor: systemColors.fill };

  return (
    <View style={styles.cardOuter}>
      <Card>
        <View style={styles.skeletonHeader}>
          <View style={[styles.skeletonAvatar, blockStyle]} />
          <View style={styles.skeletonHeaderText}>
            <View style={[styles.skeletonTitleLine, blockStyle]} />
            <View style={[styles.skeletonSmallLine, blockStyle]} />
          </View>
        </View>

        <View style={styles.skeletonBody}>
          <View style={[styles.skeletonThumbnail, blockStyle]} />
          <View style={styles.skeletonDetails}>
            <View style={[styles.skeletonClimbName, blockStyle]} />
            <View style={styles.skeletonChipRow}>
              <View style={[styles.skeletonChip, blockStyle]} />
              <View style={[styles.skeletonChip, blockStyle]} />
              <View style={[styles.skeletonShortChip, blockStyle]} />
            </View>
            <View style={[styles.skeletonCommentLine, blockStyle]} />
            <View style={[styles.skeletonCommentShortLine, blockStyle]} />
          </View>
        </View>

        <View style={[styles.skeletonSocialRow, { borderTopColor: systemColors.separator }]}>
          <View style={[styles.skeletonSocialPill, blockStyle]} />
          <View style={[styles.skeletonSocialPill, blockStyle]} />
        </View>
      </Card>
    </View>
  );
}

function RecentBetaShelf({
  videos,
  isLoading,
  isError,
  onRetry,
  onOpenClimb,
}: {
  videos: RecentBetaVideo[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpenClimb: (video: RecentBetaVideo) => void;
}) {
  const { t } = useTranslation('feed');
  const { t: tCommon } = useTranslation('common');
  const { systemColors, brandColors } = useTheme();

  return (
    <View style={styles.shelfSection}>
      <View style={styles.sectionHeaderRow}>
        <Text variant="title3">{t('mobile.home.betaTitle')}</Text>
      </View>
      {isLoading ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.shelfContent}
          scrollEnabled={false}
        >
          {Array.from({ length: 3 }).map((_, index) => (
            <View key={`beta-skeleton-${index}`} style={styles.betaSkeleton} />
          ))}
        </ScrollView>
      ) : isError ? (
        <View style={[styles.shelfState, { borderColor: systemColors.separator }]}>
          <Icon name="error" size={20} color={iosSystemColors.systemRed} />
          <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.shelfStateText}>
            {t('mobile.home.betaError')}
          </Text>
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.inlineRetry,
              { borderColor: brandColors.primary },
              pressed && { backgroundColor: `${brandColors.primary}1A` },
            ]}
          >
            <Text variant="footnote" color={brandColors.primary}>
              {tCommon('actions.retry')}
            </Text>
          </Pressable>
        </View>
      ) : videos.length === 0 ? (
        <View style={[styles.shelfState, { borderColor: systemColors.separator }]}>
          <Icon name="video" size={20} color={systemColors.tertiaryLabel} />
          <Text variant="subheadline" color={systemColors.secondaryLabel}>
            {t('mobile.home.betaEmpty')}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.shelfContent}
          snapToInterval={BETA_CARD_WIDTH + SHELF_GAP}
          decelerationRate="fast"
          snapToAlignment="start"
        >
          {videos.map((video) => (
            <RecentBetaCard key={betaLinkIdentity(video.betaLink.link)} video={video} onOpenClimb={onOpenClimb} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function RecentBetaCard({
  video,
  onOpenClimb,
}: {
  video: RecentBetaVideo;
  onOpenClimb: (video: RecentBetaVideo) => void;
}) {
  const { t } = useTranslation('feed');
  const { showToast } = useToast();
  const [imageFailed, setImageFailed] = useState(false);
  const platform = detectPlatform(video.betaLink.link);
  const username = video.betaLink.foreign_username?.trim();

  const handleOpenVideo = useCallback(async () => {
    hapticLight();
    try {
      const canOpen = await Linking.canOpenURL(video.betaLink.link);
      if (!canOpen) {
        showToast(t('mobile.home.betaOpenError'), 'error');
        return;
      }
      await Linking.openURL(video.betaLink.link);
    } catch {
      showToast(t('mobile.home.betaOpenError'), 'error');
    }
  }, [showToast, t, video.betaLink.link]);

  return (
    <View style={styles.betaCard}>
      <Pressable
        onPress={handleOpenVideo}
        accessibilityRole="link"
        accessibilityLabel={t('mobile.home.betaCardLabel')}
        style={({ pressed }) => [styles.betaVideoSurface, pressed && styles.pressed]}
      >
        {video.betaLink.thumbnail && !imageFailed ? (
          <Image
            source={{ uri: video.betaLink.thumbnail }}
            style={styles.betaThumbnail}
            contentFit="cover"
            transition={150}
            recyclingKey={video.betaLink.thumbnail}
            onError={() => setImageFailed(true)}
            accessibilityIgnoresInvertColors
            allowDownscaling={false}
          />
        ) : (
          <View style={[styles.betaThumbnail, styles.thumbnailFallback]}>
            <Icon name="video" size={28} color={iosSystemColors.systemGray} />
          </View>
        )}

        {platform ? (
          <View style={styles.platformBadge}>
            <Icon name={platform.icon} size={12} color={iosSystemColors.white} />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.betaCardFooter}>
        <Pressable
          onPress={() => onOpenClimb(video)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.climbPill, pressed && styles.climbPillPressed]}
          hitSlop={6}
        >
          <Text variant="caption1" color={iosSystemColors.white} numberOfLines={1}>
            {video.climbName ?? t('mobile.home.unknownClimb')}
          </Text>
        </Pressable>
        {username ? (
          <Text variant="caption2" color={iosSystemColors.white} numberOfLines={1} style={styles.usernameText}>
            @{username}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ActivityCard({
  item,
  summaries,
  onOpenComments,
  onOpenClimb,
}: {
  item: ActivityFeedItem;
  summaries: ActivityEntitySummaryMap;
  onOpenComments: (entityId: string, entityType: SocialEntityType) => void;
  onOpenClimb: (item: ActivityFeedItem) => void;
}) {
  const { t } = useTranslation('feed');
  const { systemColors } = useTheme();
  const boardConfig =
    item.boardType && item.layoutId != null ? getBoardConfigForPlaylist(item.boardType, item.layoutId) : null;
  const canOpenClimb = !!item.climbUuid && item.angle != null && !!boardConfig;
  const activityText = activityCopy(item, t);
  const relativeTime = formatRelativeTime(item.createdAt);
  const activityLine = relativeTime
    ? t('mobile.home.activityLine', { action: activityText, time: relativeTime })
    : activityText;
  const climbName = item.climbName ?? t('mobile.home.unknownClimb');
  const actorName = item.actorDisplayName ?? item.setterUsername ?? t('mobile.home.unknownClimber');
  const summary = getSummaryForItem(item, summaries);

  return (
    <View style={styles.cardOuter}>
      <Card>
        <Pressable
          onPress={canOpenClimb ? () => onOpenClimb(item) : undefined}
          disabled={!canOpenClimb}
          accessibilityRole={canOpenClimb ? 'button' : undefined}
        >
          <View style={styles.activityHeader}>
            <Avatar uri={item.actorAvatarUrl} name={actorName} size={40} />
            <View style={styles.activityHeaderText}>
              <Text variant="headline" numberOfLines={1}>
                {actorName}
              </Text>
              <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1}>
                {activityLine}
              </Text>
            </View>
          </View>

          <View style={styles.activityBody}>
            {boardConfig && item.frames ? (
              <ClimbListThumbnail
                frames={item.frames}
                boardName={boardConfig.boardName as unknown as BoardName}
                layoutId={boardConfig.layoutId}
                sizeId={boardConfig.sizeId}
                setIds={boardConfig.setIds.join(',')}
                mirrored={item.isMirror === true}
              />
            ) : (
              <View style={[styles.activityThumbnailFallback, { backgroundColor: systemColors.fill }]}>
                <Icon name="lightbulb" size={24} color={systemColors.tertiaryLabel} />
              </View>
            )}
            <View style={styles.activityDetails}>
              <Text variant="headline" numberOfLines={2}>
                {climbName}
              </Text>
              <ActivityMeta item={item} />
              {item.commentBody ? (
                <Text variant="subheadline" color={systemColors.secondaryLabel} numberOfLines={3} style={styles.quote}>
                  {item.commentBody}
                </Text>
              ) : item.comment ? (
                <Text variant="subheadline" color={systemColors.secondaryLabel} numberOfLines={3} style={styles.quote}>
                  {item.comment}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        {item.entityType === 'tick' || item.entityType === 'climb' ? (
          <FeedSocialRow
            entityId={item.entityId}
            entityType={item.entityType}
            upvotes={summary?.upvotes ?? 0}
            userVote={summary?.userVote ?? null}
            commentCount={item.commentCount ?? 0}
            onOpenComments={(entityId) => onOpenComments(entityId, item.entityType)}
          />
        ) : null}
      </Card>
    </View>
  );
}

function activityCopy(item: ActivityFeedItem, t: TFunction<'feed'>): string {
  if (item.type === 'new_climb') return t('mobile.home.activity.newClimb');
  if (item.type === 'comment') return t('mobile.home.activity.comment');
  if (item.type === 'proposal_approved') return t('mobile.home.activity.proposalApproved');
  if (item.status === 'flash') return t('mobile.home.activity.flash');
  if (item.status === 'send') return t('mobile.home.activity.send');
  if (item.status === 'attempt') return t('mobile.home.activity.attempt');
  return t('mobile.home.activity.ascent');
}

function ActivityMeta({ item }: { item: ActivityFeedItem }) {
  const { t } = useTranslation('feed');
  const { systemColors } = useTheme();
  const chips = [
    item.difficultyName ?? item.gradeName ?? null,
    item.angle != null ? t('mobile.home.angle', { angle: item.angle }) : null,
    displayBoardName(item.boardType, t),
  ].filter((chip): chip is string => !!chip);

  if (chips.length === 0) return null;

  return (
    <View style={styles.metaRow}>
      {chips.map((chip) => (
        <View key={chip} style={[styles.metaChip, { backgroundColor: systemColors.fill }]}>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {chip}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
    gap: spacing[2],
  },
  header: {
    paddingTop: spacing[3],
  },
  screenTitle: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
  shelfSection: {
    paddingBottom: spacing[5],
  },
  sectionHeaderRow: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  shelfContent: {
    gap: SHELF_GAP,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1],
  },
  betaCard: {
    width: BETA_CARD_WIDTH,
    height: BETA_CARD_HEIGHT,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: `${iosSystemColors.systemGray}1F`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: iosSystemColors.separator,
  },
  betaSkeleton: {
    width: BETA_CARD_WIDTH,
    height: BETA_CARD_HEIGHT,
    borderRadius: borderRadius.md,
    backgroundColor: `${iosSystemColors.systemGray}26`,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  betaVideoSurface: {
    width: '100%',
    height: '100%',
  },
  betaThumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformBadge: {
    position: 'absolute',
    top: spacing[1],
    left: spacing[1],
    width: 22,
    height: 22,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  betaCardFooter: {
    position: 'absolute',
    bottom: spacing[1],
    left: spacing[1],
    right: spacing[1],
    gap: spacing[1],
  },
  climbPill: {
    alignSelf: 'flex-start',
    maxWidth: BETA_CARD_WIDTH - spacing[2] * 2,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  climbPillPressed: {
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  usernameText: {
    paddingHorizontal: spacing[1],
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowRadius: 3,
  },
  shelfState: {
    marginHorizontal: spacing[4],
    minHeight: 72,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  shelfStateText: {
    flex: 1,
  },
  inlineRetry: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  feedHeading: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  cardOuter: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    opacity: 0.5,
  },
  skeletonHeaderText: {
    flex: 1,
    gap: spacing[2],
  },
  skeletonTitleLine: {
    width: '44%',
    height: 18,
    borderRadius: borderRadius.full,
    opacity: 0.55,
  },
  skeletonSmallLine: {
    width: '34%',
    height: 12,
    borderRadius: borderRadius.full,
    opacity: 0.4,
  },
  skeletonBody: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingTop: spacing[3],
  },
  skeletonThumbnail: {
    width: 76,
    height: 96,
    borderRadius: borderRadius.md,
    opacity: 0.55,
  },
  skeletonDetails: {
    flex: 1,
    gap: spacing[2],
  },
  skeletonClimbName: {
    width: '74%',
    height: 20,
    borderRadius: borderRadius.full,
    opacity: 0.55,
  },
  skeletonChipRow: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  skeletonChip: {
    width: 54,
    height: 20,
    borderRadius: borderRadius.full,
    opacity: 0.45,
  },
  skeletonShortChip: {
    width: 38,
    height: 20,
    borderRadius: borderRadius.full,
    opacity: 0.4,
  },
  skeletonCommentLine: {
    width: '92%',
    height: 12,
    borderRadius: borderRadius.full,
    opacity: 0.35,
  },
  skeletonCommentShortLine: {
    width: '58%',
    height: 12,
    borderRadius: borderRadius.full,
    opacity: 0.32,
  },
  skeletonSocialRow: {
    flexDirection: 'row',
    gap: spacing[6],
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  skeletonSocialPill: {
    width: 42,
    height: 18,
    borderRadius: borderRadius.full,
    opacity: 0.42,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  activityHeaderText: {
    flex: 1,
  },
  activityBody: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingTop: spacing[3],
  },
  activityThumbnailFallback: {
    width: 76,
    height: 96,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityDetails: {
    flex: 1,
    gap: spacing[2],
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  metaChip: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  quote: {
    paddingTop: spacing[1],
  },
  feedState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing[12],
    paddingHorizontal: spacing[8],
    gap: spacing[2],
  },
  emptyTitle: {
    marginTop: spacing[3],
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: spacing[4],
  },
});
