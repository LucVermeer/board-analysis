import { memo } from 'react';
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
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';

type LogbookRowProps = {
  ascent: AscentFeedItem;
  onPress: (ascent: AscentFeedItem) => void;
};

// Icon names are scheme-agnostic; the badge fill colour is resolved from the
// theme in render (brand tones lift in dark) so the static map keeps icons only.
const STATUS_ICON: Record<AscentFeedItem['status'], IconName> = {
  flash: 'flash',
  send: 'tick',
  attempt: 'circle',
};

export const LogbookRow = memo(function LogbookRow({ ascent, onPress }: LogbookRowProps) {
  const { t } = useTranslation('you');
  const { systemColors, brandColors } = useTheme();
  const { formatGrade, formatGradeByDifficultyId } = useGradeFormat();

  const statusColor: Record<AscentFeedItem['status'], string> = {
    flash: brandColors.warning,
    send: brandColors.success,
    attempt: iosSystemColors.systemGray,
  };
  const meta = { icon: STATUS_ICON[ascent.status], color: statusColor[ascent.status] };
  const rawGradeLabel = ascent.difficultyName ?? ascent.consensusDifficultyName;
  const gradeLabel =
    formatGradeByDifficultyId(ascent.difficulty ?? ascent.consensusDifficulty) ??
    formatGrade(rawGradeLabel) ??
    rawGradeLabel;
  const gradeColor = gradeLabel ? gradeBadgeColor(rawGradeLabel ?? gradeLabel) : undefined;
  const layoutName = getLayoutDisplayName(ascent.boardType, ascent.layoutId);
  const subtitle = `${formatTickRelativeTime(ascent.climbedAt)} · ${ascent.angle}° · ${layoutName}`;

  return (
    <ListRow
      title={ascent.climbName}
      subtitle={subtitle}
      onPress={() => onPress(ascent)}
      showChevron
      leading={
        <View style={[styles.badge, { backgroundColor: meta.color }]}>
          <Icon name={meta.icon} size={14} color={iosSystemColors.white} />
        </View>
      }
      trailing={
        <View style={styles.trailing}>
          {gradeLabel && gradeColor ? (
            <View style={[styles.gradePill, { backgroundColor: gradeColor }]}>
              <Text variant="caption1" color={getGradeTextColor(gradeColor)} style={styles.gradeText}>
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
});

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
