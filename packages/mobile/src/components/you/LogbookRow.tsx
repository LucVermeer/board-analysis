import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AscentFeedItem } from '@boardsesh/graphql/operations';
import { getLayoutDisplayName, formatTickRelativeTime } from '@boardsesh/profile-stats';
import { getGradeTextColor } from '@boardsesh/play-view';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { type IconName } from '../icon-map';
import { ListRow } from '../ListRow';
import { gradeBadgeColor } from './profile-chart-colors';
import { brandColors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type LogbookRowProps = {
  ascent: AscentFeedItem;
  onPress: (ascent: AscentFeedItem) => void;
};

const STATUS_META: Record<AscentFeedItem['status'], { icon: IconName; color: string }> = {
  flash: { icon: 'flash', color: brandColors.warning },
  send: { icon: 'tick', color: brandColors.success },
  attempt: { icon: 'circle', color: '#8E8E93' },
};

export function LogbookRow({ ascent, onPress }: LogbookRowProps) {
  const { t } = useTranslation('you');
  const { systemColors } = useTheme();

  const meta = STATUS_META[ascent.status];
  const gradeLabel = ascent.difficultyName ?? ascent.consensusDifficultyName;
  const layoutName = getLayoutDisplayName(ascent.boardType, ascent.layoutId);
  const subtitle = `${formatTickRelativeTime(ascent.climbedAt)} · ${ascent.angle}° · ${layoutName}`;

  return (
    <ListRow
      title={ascent.climbName}
      subtitle={subtitle}
      onPress={() => onPress(ascent)}
      leading={
        <View style={[styles.badge, { backgroundColor: meta.color }]}>
          <Icon name={meta.icon} size={14} color="#FFFFFF" />
        </View>
      }
      trailing={
        <View style={styles.trailing}>
          {gradeLabel ? (
            <View style={[styles.gradePill, { backgroundColor: gradeBadgeColor(gradeLabel) }]}>
              <Text variant="caption1" color={getGradeTextColor(gradeBadgeColor(gradeLabel))} style={styles.gradeText}>
                {gradeLabel}
              </Text>
            </View>
          ) : null}
          {ascent.attemptCount > 1 && (
            <Text variant="caption2" color={systemColors.tertiaryLabel}>
              {t('mobile.logbook.tries', { count: ascent.attemptCount })}
            </Text>
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 2,
  },
  gradePill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  gradeText: { fontWeight: '700' },
});
