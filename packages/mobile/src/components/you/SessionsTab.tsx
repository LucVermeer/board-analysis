import { useCallback, useMemo, useRef, useState } from 'react';
import { View, RefreshControl, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type BottomSheet from '@gorhom/bottom-sheet';
import type { SessionFeedItem } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ActivityIndicator } from '../ActivityIndicator';
import { SessionFeedCard } from './SessionFeedCard';
import { CommentSheet } from './CommentSheet';
import { useSessionGroupedFeed, useBulkVoteSummaries } from '../../lib/graphql/hooks';
import { TOOLBAR_RESERVE, TAB_BAR_HEIGHT } from '../../theme/layout';
import { brandColors } from '../../theme/colors';
import { spacing } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

export function SessionsTab({ userId }: { userId: string | undefined }) {
  const { t } = useTranslation('you');
  const { systemColors } = useTheme();
  const insets = useSafeAreaInsets();
  const paddingBottom = TOOLBAR_RESERVE + TAB_BAR_HEIGHT + insets.bottom + spacing[4];

  const commentSheetRef = useRef<BottomSheet | null>(null);
  const [commentSessionId, setCommentSessionId] = useState<string | null>(null);

  const feed = useSessionGroupedFeed({ userId }, !!userId);
  const sessions = useMemo(
    () => feed.data?.pages.flatMap((page) => page.sessionGroupedFeed.sessions) ?? [],
    [feed.data],
  );

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

  const handleEndReached = useCallback(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }, [feed]);

  const renderItem = useCallback(
    ({ item }: { item: SessionFeedItem }) => (
      <SessionFeedCard
        session={item}
        voteSummary={summaryMap.get(item.sessionId)}
        onOpenComments={handleOpenComments}
      />
    ),
    [handleOpenComments, summaryMap],
  );

  if (!userId || feed.isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlashList
        data={sessions}
        extraData={summaryMap}
        renderItem={renderItem}
        keyExtractor={(item) => item.sessionId}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom }}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching}
            onRefresh={() => void feed.refetch()}
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
              {t('mobile.sessions.empty')}
            </Text>
          </View>
        }
      />
      <CommentSheet sheetRef={commentSheetRef} sessionId={commentSessionId} onClose={() => setCommentSessionId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: spacing[5], alignItems: 'center' },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
    paddingHorizontal: spacing[8],
    gap: spacing[2],
  },
  emptyTitle: { opacity: 0.6, marginTop: spacing[3], textAlign: 'center' },
});
