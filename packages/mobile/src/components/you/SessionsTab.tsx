import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  RefreshControl,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type BottomSheet from '@gorhom/bottom-sheet';
import type { SessionFeedItem } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { Button } from '../Button';
import { ActivityIndicator } from '../ActivityIndicator';
import { SessionFeedCard } from './SessionFeedCard';
import { SessionsFeedHeader } from './SessionsFeedHeader';
import { FeedSectionLabel } from './FeedSectionLabel';
import { CommentSheet } from './CommentSheet';
import { bucketSessionsByRecency, dedupeSessionsById, type FeedRecencyBucket } from '../../lib/feed-time-buckets';
import { useSessionGroupedFeed, useBulkVoteSummaries } from '../../lib/graphql/hooks';
import { useBottomChromeMetrics } from '../../hooks/use-bottom-chrome-metrics';
import { spacing } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type FeedRow = { type: 'header'; bucket: FeedRecencyBucket } | { type: 'session'; item: SessionFeedItem };

type TFunc = (key: string) => string;

type SessionsTabProps = {
  userId: string | undefined;
  /** Plain-JS scroll handler from the screen, writing the shared scroll offset
   *  that drives the floating chrome's title collapse. */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Measured chrome height — the list insets its top by this so the first row
   *  rests below the floating chrome and the rest scroll under it. */
  topInset?: number;
  /** Register this tab's scroll-to-top so the screen's title capsule can reach it. */
  registerScrollToTop?: (scrollToTop: (() => void) | null) => void;
};

// String-literal `t(...)` per call so the catalog keys stay statically greppable.
function sectionLabel(bucket: FeedRecencyBucket, t: TFunc): string {
  if (bucket === 'today') return t('mobile.sessions.sectionToday');
  if (bucket === 'thisWeek') return t('mobile.sessions.sectionThisWeek');
  return t('mobile.sessions.sectionEarlier');
}

export function SessionsTab({ userId, onScroll, topInset = 0, registerScrollToTop }: SessionsTabProps) {
  const { t } = useTranslation('you');
  const { systemColors, brandColors } = useTheme();
  const router = useRouter();
  const bottomChrome = useBottomChromeMetrics();
  const paddingBottom = bottomChrome.scrollBottomPadding + spacing[4];

  const listRef = useRef<FlashListRef<FeedRow>>(null);
  useEffect(() => {
    if (!registerScrollToTop) return;
    registerScrollToTop(() => listRef.current?.scrollToTop({ animated: true }));
    return () => registerScrollToTop(null);
  }, [registerScrollToTop]);

  const commentSheetRef = useRef<BottomSheet | null>(null);
  const [commentSessionId, setCommentSessionId] = useState<string | null>(null);

  const feed = useSessionGroupedFeed({ userId }, !!userId);
  // De-dupe across pages: the OFFSET-paginated feed can return the same session
  // on two adjacent pages when its rank shifts mid-refetch, which would
  // otherwise produce duplicate FlashList keys (keyExtractor returns sessionId).
  const sessions = useMemo(
    () => dedupeSessionsById(feed.data?.pages.flatMap((page) => page.sessionGroupedFeed.sessions) ?? []),
    [feed.data],
  );

  // A single `now` shared by the rollup header and the section bucketing so the
  // two agree and neither rebuckets on every render. It re-evaluates on focus
  // and on pull-to-refresh (not per frame), so a screen left mounted across
  // midnight stops mislabelling yesterday's session as "Today".
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
    }, []),
  );

  // Flatten the recency groups into header + session rows for a single
  // virtualized list (FlashList has no built-in section support).
  const rows = useMemo<FeedRow[]>(() => {
    const groups = bucketSessionsByRecency(sessions, now);
    const flattened: FeedRow[] = [];
    for (const group of groups) {
      flattened.push({ type: 'header', bucket: group.bucket });
      for (const item of group.sessions) flattened.push({ type: 'session', item });
    }
    return flattened;
  }, [sessions, now]);

  // Per-viewer vote state for the visible sessions (the feed item carries
  // counts but not the viewer's own vote). Refetches as more pages load.
  const sessionIds = useMemo(() => sessions.map((session) => session.sessionId), [sessions]);
  const voteSummaries = useBulkVoteSummaries('session', sessionIds, !!userId && sessionIds.length > 0);
  const summaryMap = useMemo(() => {
    const map = new Map<string, { upvotes: number; userVote: number | null }>();
    for (const summary of voteSummaries.data ?? []) {
      map.set(summary.entityId, { upvotes: summary.upvotes, userVote: summary.userVote });
    }
    return map;
  }, [voteSummaries.data]);

  const handleOpenComments = useCallback((sessionId: string) => {
    setCommentSessionId(sessionId);
    commentSheetRef.current?.snapToIndex(0);
  }, []);

  const handleOpenSession = useCallback(
    (sessionId: string) => {
      router.push({ pathname: '/session/[sessionId]', params: { sessionId } });
    },
    [router],
  );

  const handleEndReached = useCallback(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }, [feed]);

  const renderItem = useCallback(
    ({ item: row }: { item: FeedRow }) => {
      if (row.type === 'header') {
        return <FeedSectionLabel label={sectionLabel(row.bucket, t)} />;
      }
      return (
        <SessionFeedCard
          session={row.item}
          voteSummary={summaryMap.get(row.item.sessionId)}
          onOpenComments={handleOpenComments}
          onPress={handleOpenSession}
        />
      );
    },
    [handleOpenComments, handleOpenSession, summaryMap, t],
  );

  // The screen's identity, in-body under the floating chrome, plus the feed
  // rollup when there are sessions. Memoized so FlashList doesn't re-measure /
  // re-render the header on every SessionsTab render — only when the rollup data
  // (sessions/now) changes. The large title always renders so it sits above the
  // empty state too.
  const listHeader = useMemo(
    () => (
      <>
        <Text variant="largeTitle" style={styles.screenTitle}>
          {t('metadata.dashboard.title')}
        </Text>
        {sessions.length > 0 ? <SessionsFeedHeader sessions={sessions} now={now} /> : null}
      </>
    ),
    [t, sessions, now],
  );

  if (!userId || feed.isPending) {
    return (
      <View style={[styles.centered, { paddingTop: topInset }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlashList
        ref={listRef}
        data={rows}
        extraData={summaryMap}
        renderItem={renderItem}
        getItemType={(row) => row.type}
        keyExtractor={(row) => (row.type === 'header' ? `header-${row.bucket}` : row.item.sessionId)}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingTop: topInset, paddingBottom }}
        scrollIndicatorInsets={{ top: topInset }}
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching}
            onRefresh={() => {
              setNow(Date.now());
              void feed.refetch();
            }}
            tintColor={brandColors.primary}
          />
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="history" size={48} color={systemColors.tertiaryLabel} />
            <Text variant="headline" style={styles.emptyTitle}>
              {t('mobile.sessions.emptyTitle')}
            </Text>
            <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.emptyBody}>
              {t('mobile.sessions.emptyBody')}
            </Text>
            <View style={styles.emptyCta}>
              {/* The Record tab hosts the session screen inline, so the CTA just
                  navigates there. */}
              <Button title={t('mobile.sessions.emptyCta')} onPress={() => router.navigate('/(tabs)/record')} />
            </View>
          </View>
        }
      />
      <CommentSheet sheetRef={commentSheetRef} entityId={commentSessionId} onClose={() => setCommentSessionId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: spacing[5], alignItems: 'center' },
  screenTitle: {
    paddingHorizontal: spacing[4],
    paddingTop: 0,
    paddingBottom: spacing[2],
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
    paddingHorizontal: spacing[8],
    gap: spacing[2],
  },
  emptyTitle: { marginTop: spacing[3], textAlign: 'center' },
  emptyBody: { textAlign: 'center' },
  emptyCta: { marginTop: spacing[4] },
});
