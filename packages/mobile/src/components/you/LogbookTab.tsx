import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  RefreshControl,
  Pressable,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import type BottomSheet from '@gorhom/bottom-sheet';
import type { AscentFeedItem } from '@boardsesh/graphql/operations';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { track } from '../../lib/analytics';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ActivityIndicator } from '../ActivityIndicator';
import { LogbookRow } from './LogbookRow';
import { LogbookEditSheet } from './LogbookEditSheet';
import { useUserAscentsFeed } from '../../lib/graphql/hooks';
import { useBottomChromeMetrics } from '../../hooks/use-bottom-chrome-metrics';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type LogbookTabProps = {
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

export function LogbookTab({ userId, onScroll, topInset = 0, registerScrollToTop }: LogbookTabProps) {
  const { t } = useTranslation('you');
  const { systemColors, brandColors } = useTheme();
  const bottomChrome = useBottomChromeMetrics();
  const paddingBottom = bottomChrome.scrollBottomPadding + spacing[4];

  const listRef = useRef<FlashListRef<AscentFeedItem>>(null);
  useEffect(() => {
    if (!registerScrollToTop) return;
    registerScrollToTop(() => listRef.current?.scrollToTop({ animated: true }));
    return () => registerScrollToTop(null);
  }, [registerScrollToTop]);

  const editSheetRef = useRef<BottomSheet | null>(null);
  const [editAscent, setEditAscent] = useState<AscentFeedItem | null>(null);

  const feed = useUserAscentsFeed(userId);
  // Stabilise the FlashList `data` identity so it doesn't re-diff every render.
  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.userAscentsFeed.items) ?? [], [feed.data]);

  const handlePress = useCallback((ascent: AscentFeedItem) => {
    track(SHARED_EVENTS.LogbookRowClicked, { climbUuid: ascent.climbUuid });
    setEditAscent(ascent);
    editSheetRef.current?.snapToIndex(0);
  }, []);

  const handleEndReached = useCallback(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }, [feed]);

  const handleRetry = useCallback(() => {
    void feed.refetch();
  }, [feed]);

  const renderItem = useCallback(
    ({ item }: { item: AscentFeedItem }) => <LogbookRow ascent={item} onPress={handlePress} />,
    [handlePress],
  );

  // The screen's identity, in-body under the floating chrome. Memoized so
  // FlashList doesn't re-render the header on every LogbookTab render. Always
  // present so it sits above the empty state too.
  const listHeader = useMemo(
    () => (
      <Text variant="largeTitle" style={styles.screenTitle}>
        {t('metadata.dashboard.title')}
      </Text>
    ),
    [t],
  );

  if (!userId || feed.isPending) {
    return (
      <View style={[styles.centered, { paddingTop: topInset }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (feed.isError) {
    return (
      <View style={[styles.errorContainer, { paddingTop: topInset }]}>
        <Icon name="error" size={48} color={systemColors.tertiaryLabel} />
        <Text variant="headline" style={styles.errorTitle}>
          {t('mobile.logbook.errorTitle')}
        </Text>
        <Text variant="subheadline" style={styles.errorBody}>
          {t('mobile.logbook.errorBody')}
        </Text>
        <Pressable
          onPress={handleRetry}
          disabled={feed.isRefetching}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.logbook.retry')}
          style={({ pressed }) => [
            styles.retryButton,
            { borderColor: brandColors.primary },
            feed.isRefetching && styles.retryButtonDisabled,
            pressed && !feed.isRefetching && { backgroundColor: `${brandColors.primary}1A` },
          ]}
        >
          <Text variant="footnote" color={brandColors.primary}>
            {t('mobile.logbook.retry')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlashList
        ref={listRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
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
            <Icon name="tick.outline" size={48} color={systemColors.tertiaryLabel} />
            <Text variant="headline" style={styles.emptyTitle}>
              {t('mobile.logbook.empty')}
            </Text>
          </View>
        }
      />
      <LogbookEditSheet sheetRef={editSheetRef} ascent={editAscent} onClose={() => setEditAscent(null)} />
    </View>
  );
}

function keyExtractor(item: AscentFeedItem) {
  return item.uuid;
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
  emptyTitle: { opacity: 0.6, marginTop: spacing[3], textAlign: 'center' },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
    gap: spacing[2],
  },
  errorTitle: { marginTop: spacing[3], textAlign: 'center' },
  errorBody: { opacity: 0.6, textAlign: 'center' },
  retryButton: {
    marginTop: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  retryButtonDisabled: { opacity: 0.5 },
});
