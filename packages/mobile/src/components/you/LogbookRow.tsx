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
import { PressableSurface } from '../PressableSurface';
import { ClimbListItemContent, type ClimbListItemClimb } from '../ClimbListItemContent';
import { gradeBadgeColor } from './profile-chart-colors';
import { brandColors, withAlpha } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { getBoardConfigForPlaylist } from '../../lib/playlists/board-details-for-playlist';
import { hapticSelection } from '../../lib/haptics';

type LogbookRowProps = {
  ascent: AscentFeedItem;
  onPress: (ascent: AscentFeedItem) => void;
};

// Module-level status metadata keeps the virtualised list from allocating icon
// maps per row. The shared climb-list row uses these colours as tints; the
// fallback text row keeps the older filled badge.
const STATUS_META: Record<AscentFeedItem['status'], { icon: IconName; color: string }> = {
  flash: { icon: 'flash', color: brandColors.warning },
  send: { icon: 'tick', color: brandColors.success },
  attempt: { icon: 'circle', color: iosSystemColors.systemGray },
};

function ascentToClimb(ascent: AscentFeedItem): ClimbListItemClimb | null {
  if (!ascent.frames) return null;
  return {
    uuid: ascent.climbUuid,
    name: ascent.climbName,
    frames: ascent.frames,
    difficulty: ascent.difficultyName ?? ascent.consensusDifficultyName ?? '',
    ascensionist_count: 0,
    quality_average: ascent.qualityAverage != null ? String(ascent.qualityAverage) : '0',
    setter_username: ascent.setterUsername ?? '',
    benchmark_difficulty: ascent.isBenchmark ? (ascent.consensusDifficultyName ?? ascent.difficultyName ?? null) : null,
    mirrored: ascent.isMirror,
    is_no_match: ascent.isNoMatch,
  };
}

export const LogbookRow = memo(function LogbookRow({ ascent, onPress }: LogbookRowProps) {
  const { t } = useTranslation('you');
  const { systemColors } = useTheme();
  const { formatGrade, formatGradeByDifficultyId } = useGradeFormat();

  const meta = STATUS_META[ascent.status];
  const rawGradeLabel = ascent.difficultyName ?? ascent.consensusDifficultyName;
  const gradeLabel =
    formatGradeByDifficultyId(ascent.difficulty ?? ascent.consensusDifficulty) ??
    formatGrade(rawGradeLabel) ??
    rawGradeLabel;
  const gradeColor = gradeLabel ? gradeBadgeColor(rawGradeLabel ?? gradeLabel) : undefined;
  const layoutName = getLayoutDisplayName(ascent.boardType, ascent.layoutId);
  const triesLabel = t('mobile.logbook.tries', { count: ascent.attemptCount });
  const subtitleParts = [layoutName, triesLabel, `${ascent.angle}°`, formatTickRelativeTime(ascent.climbedAt)];
  const subtitle = subtitleParts.join(' · ');
  const climb = ascentToClimb(ascent);
  const boardConfig = getBoardConfigForPlaylist(ascent.boardType, ascent.layoutId);

  const handlePress = () => {
    hapticSelection();
    onPress(ascent);
  };

  if (climb && boardConfig) {
    return (
      <View>
        <PressableSurface
          onPress={handlePress}
          feedback="opacity"
          opacityTo={0.7}
          accessibilityRole="button"
          accessibilityLabel={ascent.climbName}
          style={[styles.row, { backgroundColor: systemColors.secondaryBackground }]}
        >
          <View style={styles.statusSlot}>
            <View style={[styles.statusIcon, { backgroundColor: withAlpha(meta.color, 0.15) }]}>
              <Icon name={meta.icon} size={14} color={meta.color} />
            </View>
          </View>
          <ClimbListItemContent
            climb={climb}
            boardName={boardConfig.boardName}
            layoutId={boardConfig.layoutId}
            sizeId={boardConfig.sizeId}
            setIds={boardConfig.setIds.join(',')}
            angle={ascent.angle}
            subtitleLeadingParts={subtitleParts}
            showAscentStatus={false}
          />
        </PressableSurface>
        <View style={[styles.separator, { backgroundColor: systemColors.separator }]} />
      </View>
    );
  }

  return (
    <ListRow
      title={ascent.climbName}
      subtitle={subtitle}
      onPress={handlePress}
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
          <Text variant="caption2" color={systemColors.tertiaryLabel}>
            {triesLabel}
          </Text>
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing[3],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  statusSlot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing[3] + 28 + spacing[3],
  },
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
