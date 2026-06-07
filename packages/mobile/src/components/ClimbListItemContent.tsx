import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BoardName } from '@boardsesh/shared-schema';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { Text } from './Text';
import { ClimbListThumbnail, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT } from './ClimbListThumbnail';
import { formatSends, formatQuality } from '../lib/format-climb-stats';
import { useGradeFormat } from '../hooks/use-grade-format';
import { useAscentStatus } from '../hooks/use-ascent-status';
import { iosSystemColors } from '../theme/ios-colors';
import type { AscentStatusValue } from '../lib/ascent-status-utils';

// Scan-line status dot colours — green sent, yellow flash, orange attempted.
const ASCENT_DOT_COLOR: Record<AscentStatusValue, string> = {
  send: iosSystemColors.systemGreen,
  flash: iosSystemColors.systemYellow,
  attempt: iosSystemColors.systemOrange,
};

/**
 * Minimal structural climb shape this visual needs. Kept permissive so BOTH the
 * web-schema `Climb` (search list) and the `@boardsesh/queue` `Climb` (queue
 * items / playlist suggestions) satisfy it without a cast — the two declare
 * their own `Climb` types.
 */
export type ClimbListItemClimb = {
  uuid: string;
  name: string;
  frames: string;
  difficulty: string;
  mirrored?: boolean | null;
  is_draft?: boolean | null;
  ascensionist_count?: number | null;
  quality_average: string;
  setter_username?: string | null;
};

type ClimbListItemContentProps = {
  climb: ClimbListItemClimb;
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
};

/**
 * The shared visual of a climb list item: portrait thumbnail (with ascent
 * badge) + name/subtitle + colorized grade. Returns the three blocks as a
 * fragment so the host row owns the flex container (padding, gap, background,
 * selected/dimmed overlays) — this keeps `ClimbListRow`'s search-list layout
 * byte-for-byte identical while letting the queue row reuse the same visual
 * around its own position indicator and trailing actions.
 */
const ClimbListItemContent = React.memo(function ClimbListItemContent({
  climb,
  boardName,
  layoutId,
  sizeId,
  setIds,
  angle,
}: ClimbListItemContentProps) {
  const { t } = useTranslation('climbs');
  const { formatGrade } = useGradeFormat();

  const gradeColor = getGradeColor(climb.difficulty) ?? DEFAULT_GRADE_COLOR;
  const formattedGrade = formatGrade(climb.difficulty);
  const ascentStatus = useAscentStatus(climb.uuid, angle);

  // Subtitle parts: sends · quality★ · setter (each dropped when absent).
  const subtitleText = useMemo(() => {
    const parts: string[] = [];
    if (climb.is_draft) {
      parts.push(t('createClimbForm.draftBadge'));
    }
    if (!climb.is_draft && climb.ascensionist_count) {
      parts.push(formatSends(climb.ascensionist_count, t));
    }
    const qualityNum = parseFloat(climb.quality_average);
    if (qualityNum > 0) {
      parts.push(`${formatQuality(climb.quality_average)}★`);
    }
    if (climb.setter_username) {
      parts.push(climb.setter_username);
    }
    return parts.length > 0 ? parts.join(' · ') : t('mobile.climbRow.projectFallback');
  }, [climb.is_draft, climb.ascensionist_count, climb.quality_average, climb.setter_username, t]);

  return (
    <>
      {/* Left: portrait thumbnail with ascent badge */}
      <View style={styles.thumbnailContainer}>
        <ClimbListThumbnail
          frames={climb.frames}
          boardName={boardName}
          layoutId={layoutId}
          sizeId={sizeId}
          setIds={setIds}
          mirrored={climb.mirrored ?? false}
        />
      </View>

      {/* Center: name + subtitle */}
      <View style={styles.centerColumn}>
        <Text variant="body" numberOfLines={1} style={styles.climbName}>
          {climb.name}
        </Text>
        <Text variant="footnote" numberOfLines={1} style={styles.subtitle}>
          {subtitleText}
        </Text>
      </View>

      {/* Right: ascent-status dot + colorized grade — the two scan keys together */}
      <View style={styles.rightSection}>
        {ascentStatus ? <View style={[styles.statusDot, { backgroundColor: ASCENT_DOT_COLOR[ascentStatus] }]} /> : null}
        <Text variant="title3" numberOfLines={1} style={[styles.gradeText, { color: gradeColor }]}>
          {formattedGrade ?? climb.difficulty}
        </Text>
      </View>
    </>
  );
});

export { ClimbListItemContent };

const styles = StyleSheet.create({
  thumbnailContainer: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    flexShrink: 0,
    position: 'relative',
  },
  centerColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  climbName: {
    fontWeight: '600',
  },
  subtitle: {
    opacity: 0.6,
  },
  rightSection: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gradeText: {
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
});
