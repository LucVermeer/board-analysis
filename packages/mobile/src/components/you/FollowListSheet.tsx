import { type RefObject } from 'react';
import { View, StyleSheet } from 'react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Avatar } from '../Avatar';
import { ListRow } from '../ListRow';
import { Sheet } from '../Sheet';
import { ActivityIndicator } from '../ActivityIndicator';
import { useFollowers, useFollowing } from '../../lib/graphql/hooks';
import { spacing } from '../../theme/tokens';

type FollowListSheetProps = {
  sheetRef: RefObject<BottomSheet | null>;
  userId: string | undefined;
  mode: 'followers' | 'following';
  /** Only fetch once the sheet has been opened. */
  enabled: boolean;
};

/** Bottom sheet listing a user's followers or following. */
export function FollowListSheet({ sheetRef, userId, mode, enabled }: FollowListSheetProps) {
  const { t } = useTranslation('you');
  const followersQuery = useFollowers(userId, enabled && mode === 'followers');
  const followingQuery = useFollowing(userId, enabled && mode === 'following');

  // Pull `users` from the mode-specific query (avoids a response union), but read
  // status/pagination off whichever query is active.
  const users =
    mode === 'followers'
      ? followersQuery.data?.pages.flatMap((page) => page.followers.users)
      : followingQuery.data?.pages.flatMap((page) => page.following.users);
  const query = mode === 'followers' ? followersQuery : followingQuery;

  return (
    <Sheet
      ref={sheetRef}
      snapPoints={['60%', '90%']}
      scrollable
      fullWindowOverlay
      contentContainerStyle={styles.content}
    >
      <Text variant="title3" style={styles.title}>
        {mode === 'followers' ? t('mobile.followers') : t('mobile.following')}
      </Text>
      {query.isPending && enabled ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : !users || users.length === 0 ? (
        <Text variant="subheadline" style={styles.empty}>
          {mode === 'followers' ? t('mobile.emptyFollowers') : t('mobile.emptyFollowing')}
        </Text>
      ) : (
        <>
          {users.map((user) => (
            <ListRow
              key={user.id}
              title={user.displayName ?? t('mobile.unknownName')}
              subtitle={t('mobile.followerCount', { count: user.followerCount })}
              leading={<Avatar uri={user.avatarUrl} name={user.displayName} size={40} />}
              showSeparator
            />
          ))}
          {query.hasNextPage && (
            <ListRow title={t('mobile.loadMore')} onPress={() => void query.fetchNextPage()} showSeparator={false} />
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing[8],
  },
  title: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  centered: {
    paddingVertical: spacing[10],
    alignItems: 'center',
  },
  empty: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[6],
    opacity: 0.6,
  },
});
