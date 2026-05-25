import { memo, useCallback } from 'react';
import { Pressable, View, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import type { BetaLink } from '@boardsesh/shared-schema';
import { isInstagramUrl, isTikTokUrl } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { Icon } from '../Icon';
import type { IconName } from '../icon-map';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing, borderRadius } from '../../theme/tokens';

export const BETA_CARD_WIDTH = 140;
const BETA_CARD_ASPECT_RATIO = 9 / 16;
export const BETA_CARD_HEIGHT = BETA_CARD_WIDTH / BETA_CARD_ASPECT_RATIO;

type Props = {
  link: BetaLink;
};

export const BetaVideoCard = memo(function BetaVideoCard({ link }: Props) {
  const onPress = useCallback(() => {
    void Haptics.selectionAsync();
    void Linking.openURL(link.link);
  }, [link.link]);

  const platform = detectPlatform(link.link);
  const username = link.foreign_username?.trim();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={username ? `Beta video by @${username}` : 'Beta video'}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {link.thumbnail ? (
        <Image
          source={{ uri: link.thumbnail }}
          style={styles.thumbnail}
          contentFit="cover"
          transition={150}
          recyclingKey={link.thumbnail}
        />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailFallback]}>
          <Icon name="video" size={28} color={iosSystemColors.systemGray} />
        </View>
      )}

      {platform && (
        <View style={styles.platformBadge}>
          <Icon name={platform.icon} size={12} color={iosSystemColors.white} />
        </View>
      )}

      {username && (
        <View style={styles.usernamePill}>
          <Text variant="caption2" color={iosSystemColors.white} numberOfLines={1}>
            @{username}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

function detectPlatform(url: string): { name: 'instagram' | 'tiktok'; icon: IconName } | null {
  if (isInstagramUrl(url)) return { name: 'instagram', icon: 'instagram' };
  if (isTikTokUrl(url)) return { name: 'tiktok', icon: 'tiktok' };
  return null;
}

const styles = StyleSheet.create({
  card: {
    width: BETA_CARD_WIDTH,
    height: BETA_CARD_HEIGHT,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: `${iosSystemColors.systemGray}1F`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: iosSystemColors.separator,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  thumbnail: {
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
  usernamePill: {
    position: 'absolute',
    bottom: spacing[1],
    left: spacing[1],
    maxWidth: BETA_CARD_WIDTH - spacing[2] * 2,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
