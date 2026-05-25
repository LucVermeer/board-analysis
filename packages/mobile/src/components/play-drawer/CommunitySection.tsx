import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { formatQuality } from '../../lib/format-climb-stats';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type CommunitySectionProps = {
  climbUuid: string;
  boardName: string;
  angle: number;
  qualityAverage: string;
  ascensionistCount: number;
};

export const CommunitySection = memo(function CommunitySection({
  qualityAverage,
  ascensionistCount,
}: CommunitySectionProps) {
  const { t } = useTranslation('session');

  const qualityNum = parseFloat(qualityAverage);
  const hasQuality = qualityNum > 0;
  const hasAscensionists = ascensionistCount > 0;

  if (!hasQuality && !hasAscensionists) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="people" size={20} color={iosSystemColors.systemGray} />
        <Text variant="subheadline" color={iosSystemColors.systemGray}>
          {t('mobile.community.empty')}
        </Text>
      </View>
    );
  }

  const starIcons = useMemo(() => {
    if (!hasQuality) return null;
    const fullStars = Math.floor(qualityNum);
    const totalStars = 5;
    return Array.from({ length: totalStars }, (_, starIndex) => (
      <Icon
        key={starIndex}
        name={starIndex < fullStars ? 'star.fill' : 'star'}
        size={14}
        color={starIndex < fullStars ? iosSystemColors.starGold : iosSystemColors.systemGray4}
      />
    ));
  }, [qualityNum]);

  return (
    <View style={styles.container}>
      {/* Quality rating */}
      {hasQuality && (
        <View style={styles.statRow}>
          <View style={styles.starsRow}>{starIcons}</View>
          <Text variant="subheadline" color={iosSystemColors.systemGray}>
            {formatQuality(qualityAverage)} &middot; {t('mobile.community.avgQuality')}
          </Text>
        </View>
      )}

      {/* Ascensionist count */}
      {hasAscensionists && (
        <View style={styles.statRow}>
          <Icon name="people" size={18} color={iosSystemColors.systemGray} />
          <Text variant="subheadline">{t('mobile.community.ascensionists', { count: ascensionistCount })}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing[3],
  },
  emptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
});
