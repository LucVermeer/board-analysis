import { useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Avatar } from '../Avatar';
import { FollowListSheet } from './FollowListSheet';
import { spacing } from '../../theme/tokens';

type FollowProfile = {
  displayName?: string | null;
  avatarUrl?: string | null;
  followerCount: number;
  followingCount: number;
};

type YouProfileHeaderProps = {
  userId: string | undefined;
  profile: FollowProfile | null;
};

/** Fixed header shown above the swipeable tabs: avatar, name, follow counts. */
export function YouProfileHeader({ userId, profile }: YouProfileHeaderProps) {
  const { t } = useTranslation('you');
  const sheetRef = useRef<BottomSheet | null>(null);
  const [mode, setMode] = useState<'followers' | 'following'>('followers');
  const [opened, setOpened] = useState(false);

  const open = (next: 'followers' | 'following') => {
    setMode(next);
    setOpened(true);
    sheetRef.current?.snapToIndex(0);
  };

  const displayName = profile?.displayName || t('mobile.unknownName');

  return (
    <View style={styles.container}>
      <Avatar uri={profile?.avatarUrl} name={profile?.displayName} size={72} />
      <Text variant="title2" style={styles.name} numberOfLines={1}>
        {displayName}
      </Text>
      <View style={styles.counts}>
        <Pressable
          style={styles.countButton}
          onPress={() => open('followers')}
          accessibilityRole="button"
          disabled={!profile}
        >
          <Text variant="subheadline">
            <Text variant="subheadline" style={styles.countValue}>
              {profile?.followerCount ?? 0}
            </Text>{' '}
            {t('mobile.followers')}
          </Text>
        </Pressable>
        <Text variant="subheadline" style={styles.dot}>
          ·
        </Text>
        <Pressable
          style={styles.countButton}
          onPress={() => open('following')}
          accessibilityRole="button"
          disabled={!profile}
        >
          <Text variant="subheadline">
            <Text variant="subheadline" style={styles.countValue}>
              {profile?.followingCount ?? 0}
            </Text>{' '}
            {t('mobile.following')}
          </Text>
        </Pressable>
      </View>

      <FollowListSheet sheetRef={sheetRef} userId={userId} mode={mode} enabled={opened} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    paddingHorizontal: spacing[4],
  },
  name: {
    marginTop: spacing[3],
  },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[2],
    gap: spacing[2],
  },
  countButton: {
    paddingVertical: spacing[1],
  },
  countValue: {
    fontWeight: '700',
  },
  dot: {
    opacity: 0.5,
  },
});
