import { memo, useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Linking, type ColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import { isBetaVideoUrl } from '@boardsesh/shared-schema';
import type { BoardName, SessionFeedItem, SessionFeedTickHighlight, SocialEntityType } from '@boardsesh/shared-schema';
import { formatTickRelativeTime } from '@boardsesh/profile-stats';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { type IconName } from '../icon-map';
import { Card } from '../Card';
import { PressableSurface } from '../PressableSurface';
import { ClimbListThumbnail } from '../ClimbListThumbnail';
import { AvatarGroup } from './AvatarGroup';
import { FeedSocialRow } from './FeedSocialRow';
import { StackedBarChart } from './YouCharts';
import { GradeChip } from './GradeChip';
import { MetricChip } from './MetricChip';
import { buildSessionGradeBars } from './profile-chart-colors';
import { mapBetaLink } from '../../lib/beta-video-url';
import { getBoardConfigForPlaylist } from '../../lib/playlists/board-details-for-playlist';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { useToast } from '../../providers/toast-provider';
import { hapticLight } from '../../lib/haptics';

type SessionFeedCardProps = {
  session: SessionFeedItem;
  /** Per-viewer vote summary (count + userVote) for this session/tick, if loaded. */
  voteSummary?: { upvotes: number; userVote: number | null };
  onOpenComments: (entityId: string, entityType: SocialEntityType) => void;
  onPress: (session: SessionFeedItem) => void;
  onOpenClimb?: (tick: SessionFeedTickHighlight) => void;
};

/** Enlarged board-art cell for the hero (the default list cell is 76×96). */
const HERO_THUMBNAIL = { width: 100, height: 128 } as const;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function tickStatusLabel(status: string, t: (key: string) => string): string {
  if (status === 'flash') return t('sessionFeedCard.status.flash');
  if (status === 'send') return t('sessionFeedCard.status.send');
  if (status === 'attempt') return t('sessionFeedCard.status.attempt');
  return status;
}

function compactJoin(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => !!part).join(' · ');
}

function isSafeBetaVideoUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:' && isBetaVideoUrl(url);
  } catch {
    return false;
  }
}

export const SessionFeedCard = memo(function SessionFeedCard({
  session,
  voteSummary,
  onOpenComments,
  onPress,
  onOpenClimb,
}: SessionFeedCardProps) {
  const { t } = useTranslation('feed');
  const { systemColors, brandColors } = useTheme();
  const { formatGrade } = useGradeFormat();
  const { showToast } = useToast();
  const [chartExpanded, setChartExpanded] = useState(false);

  const names = session.participants
    .map((participant) => participant.displayName)
    .filter((name): name is string => !!name)
    .join(', ');
  const title = names || t('sessionFeedCard.climbCount', { count: session.tickCount });

  const gradeBars = useMemo(
    () => buildSessionGradeBars(session.gradeDistribution, formatGrade),
    [session.gradeDistribution, formatGrade],
  );

  const primaryBoard = session.boardTypes[0] ?? null;
  const metaLine = compactJoin([
    formatTickRelativeTime(session.lastTickAt),
    session.durationMinutes != null && session.durationMinutes > 0 ? formatDuration(session.durationMinutes) : null,
    primaryBoard,
  ]);

  const hardestSend = session.hardestSend ?? null;
  const displayHardestGrade = session.hardestGrade ? (formatGrade(session.hardestGrade) ?? session.hardestGrade) : null;

  const betaLink = session.featuredBeta ? mapBetaLink(session.featuredBeta.betaLink) : null;
  const betaUrl = betaLink?.link ?? null;

  const handleCardPress = useCallback(() => {
    hapticLight();
    onPress(session);
  }, [onPress, session]);

  const handleHeroPress = useCallback(() => {
    if (hardestSend && onOpenClimb) {
      hapticLight();
      onOpenClimb(hardestSend);
      return;
    }
    handleCardPress();
  }, [handleCardPress, hardestSend, onOpenClimb]);

  const handleToggleChart = useCallback(() => {
    hapticLight();
    setChartExpanded((expanded) => !expanded);
  }, []);

  const handleOpenBeta = useCallback(async () => {
    if (!betaUrl) return;
    hapticLight();
    try {
      if (!isSafeBetaVideoUrl(betaUrl) || !(await Linking.canOpenURL(betaUrl))) {
        showToast(t('mobile.home.betaOpenError'), 'error');
        return;
      }
      await Linking.openURL(betaUrl);
    } catch {
      showToast(t('mobile.home.betaOpenError'), 'error');
    }
  }, [betaUrl, showToast, t]);

  const heroAccessibilityLabel = hardestSend
    ? t('sessionFeedCard.openHardestClimb', { climb: hardestSend.climbName ?? t('sessionFeedCard.unknownClimb') })
    : compactJoin([title, metaLine]);

  const cardAccessibilityLabel = compactJoin([
    title,
    metaLine,
    t('sessionFeedCard.sendsCount', { count: session.totalSends }),
    displayHardestGrade ? t('sessionFeedCard.hardestGrade', { grade: displayHardestGrade }) : null,
  ]);

  return (
    <View style={styles.wrapper}>
      <Card>
        {/* Header + goal open the SESSION; the hero opens the hardest-send
            CLIMB in the play drawer. Two tap targets so the session-detail
            entry point survives even when a hardest send is present. */}
        <PressableSurface
          onPress={handleCardPress}
          feedback="opacity"
          accessibilityRole="button"
          accessibilityLabel={cardAccessibilityLabel}
          accessibilityHint={t('sessionFeedCard.openHint')}
          style={styles.heroPressable}
        >
          <View style={styles.header}>
            <AvatarGroup participants={session.participants} size={36} />
            <View style={styles.headerText}>
              <Text variant="subheadline" style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Text variant="caption1" color={systemColors.tertiaryLabel} numberOfLines={1} style={styles.metaLine}>
                {metaLine}
              </Text>
            </View>
          </View>

          {session.goal ? (
            <View style={styles.goal}>
              <Icon name="flag" size={13} color={systemColors.secondaryLabel} />
              <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={2} style={styles.flex}>
                {session.goal}
              </Text>
            </View>
          ) : null}
        </PressableSurface>

        {hardestSend ? (
          <PressableSurface
            onPress={handleHeroPress}
            feedback="opacity"
            accessibilityRole="button"
            accessibilityLabel={heroAccessibilityLabel}
            accessibilityHint={t('sessionFeedCard.openHint')}
            style={styles.heroPressable}
          >
            <HeroSend tick={hardestSend} />
          </PressableSurface>
        ) : null}

        <View style={[styles.divider, { backgroundColor: systemColors.separator }]} />

        <SessionStats session={session} displayHardestGrade={displayHardestGrade} />

        <View style={[styles.divider, { backgroundColor: systemColors.separator }]} />

        {chartExpanded ? (
          <View style={styles.chart} pointerEvents="none">
            <StackedBarChart
              bars={gradeBars}
              colorBy="grade"
              height={132}
              fitYAxisToData
              interactive={false}
              zoomable={false}
              emptyLabel={t('sessionFeedCard.chartEmpty')}
            />
          </View>
        ) : null}

        <View style={styles.footer}>
          <FeedSocialRow
            entityId={session.socialEntityId}
            entityType={session.socialEntityType}
            upvotes={voteSummary?.upvotes ?? session.upvotes}
            userVote={voteSummary?.userVote ?? null}
            commentCount={session.commentCount}
            onOpenComments={(entityId) => onOpenComments(entityId, session.socialEntityType)}
            compact
          />
          <View style={styles.footerChips}>
            {betaUrl ? (
              <FooterChip
                icon="video"
                label={t('sessionFeedCard.betaCaption')}
                color={brandColors.primary}
                onPress={handleOpenBeta}
              />
            ) : null}
            <FooterChip
              icon="chart.bar"
              label={t('sessionFeedCard.chartLabel')}
              color={systemColors.secondaryLabel}
              selected={chartExpanded}
              onPress={handleToggleChart}
            />
          </View>
        </View>
      </Card>
    </View>
  );
});

/** Always-visible hero: enlarged board art + the session's hardest send. */
const HeroSend = memo(function HeroSend({ tick }: { tick: SessionFeedTickHighlight }) {
  const { t } = useTranslation('feed');
  const { systemColors, brandColors } = useTheme();
  const { formatGrade } = useGradeFormat();

  const boardConfig = getBoardConfigForPlaylist(tick.boardType, tick.layoutId);
  const displayGrade = tick.difficultyName ? (formatGrade(tick.difficultyName) ?? tick.difficultyName) : null;
  const statusLabel = tickStatusLabel(tick.status, t);
  const statusIcon: IconName = tick.status === 'flash' ? 'flash' : 'check.small';
  const attemptLabel = tick.attemptCount > 1 ? t('sessionFeedCard.attempts', { count: tick.attemptCount }) : null;

  return (
    <View style={styles.hero}>
      {boardConfig && tick.frames ? (
        <ClimbListThumbnail
          frames={tick.frames}
          boardName={boardConfig.boardName as BoardName}
          layoutId={boardConfig.layoutId}
          sizeId={boardConfig.sizeId}
          setIds={boardConfig.setIds.join(',')}
          mirrored={tick.isMirror}
          size={HERO_THUMBNAIL}
        />
      ) : (
        <View style={[styles.thumbnailFallback, { backgroundColor: systemColors.fill }]}>
          <Icon name="lightbulb" size={28} color={systemColors.tertiaryLabel} />
        </View>
      )}
      <View style={styles.heroDetails}>
        <Text variant="caption2" color={systemColors.tertiaryLabel} style={styles.eyebrow}>
          {t('sessionFeedCard.hardestSend').toUpperCase()}
        </Text>
        <Text variant="title3" numberOfLines={2}>
          {tick.climbName ?? t('sessionFeedCard.unknownClimb')}
        </Text>
        {displayGrade ? <GradeChip grade={displayGrade} hueKey={tick.difficultyName ?? displayGrade} /> : null}
        <View style={styles.statusRow}>
          <Icon name={statusIcon} size={13} color={brandColors.success} />
          <Text variant="footnote" color={brandColors.success} style={styles.statusText}>
            {statusLabel}
          </Text>
          {attemptLabel ? (
            <>
              <Text variant="footnote" color={systemColors.tertiaryLabel}>
                ·
              </Text>
              <Text variant="footnote" color={systemColors.secondaryLabel}>
                {attemptLabel}
              </Text>
            </>
          ) : null}
        </View>
        {tick.comment ? (
          <Text variant="subheadline" color={systemColors.secondaryLabel} numberOfLines={1} style={styles.quote}>
            {tick.comment}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

/**
 * Drop the leading `{{count}}` token from a pluralised count label so the chip
 * can show the number on its own value line and the bare noun as the label.
 * Every locale formats these keys as "{{count}} <noun>" (count first, space,
 * noun), so splitting on the first space is locale-safe.
 */
function nounFromCountLabel(countLabel: string): string {
  const firstSpace = countLabel.indexOf(' ');
  return firstSpace === -1 ? countLabel : countLabel.slice(firstSpace + 1);
}

/**
 * Stats rail: sends / hardest / flashes / tries. Exactly one coloured chip —
 * the grade-hued 'trophy' "hardest" chip — so the stats don't compete. Flashes
 * and tries chips drop out when their count is 0. Plural labels stay
 * grammatical (count passed for pluralisation, then the number is split off).
 */
const SessionStats = memo(function SessionStats({
  session,
  displayHardestGrade,
}: {
  session: SessionFeedItem;
  displayHardestGrade: string | null;
}) {
  const { t } = useTranslation('feed');
  return (
    <View style={styles.stats}>
      <MetricChip
        value={String(session.totalSends)}
        label={nounFromCountLabel(t('sessionFeedCard.sendsCount', { count: session.totalSends }))}
      />
      {displayHardestGrade ? (
        <MetricChip
          value={displayHardestGrade}
          label={t('sessionFeedCard.hardest')}
          variant="trophy"
          hueKey={session.hardestGrade ?? displayHardestGrade}
        />
      ) : null}
      {session.totalFlashes > 0 ? (
        <MetricChip
          value={String(session.totalFlashes)}
          label={nounFromCountLabel(t('sessionFeedCard.flashesCount', { count: session.totalFlashes }))}
        />
      ) : null}
      {session.totalAttempts > 0 ? (
        <MetricChip
          value={String(session.totalAttempts)}
          label={nounFromCountLabel(t('sessionFeedCard.attempts', { count: session.totalAttempts }))}
        />
      ) : null}
    </View>
  );
});

/** Compact icon + label pill used for the chart toggle and beta link. */
function FooterChip({
  icon,
  label,
  color,
  selected = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  color: ColorValue;
  selected?: boolean;
  onPress: () => void;
}) {
  const { systemColors } = useTheme();
  return (
    <PressableSurface
      onPress={onPress}
      feedback="opacity"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.footerChip, selected ? { backgroundColor: systemColors.fill } : null]}
    >
      <Icon name={icon} size={15} color={color} />
      <Text variant="footnote" color={color} numberOfLines={1}>
        {label}
      </Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: spacing[4], marginTop: spacing[3] },
  heroPressable: {
    margin: -spacing[1],
    padding: spacing[1],
    borderRadius: borderRadius.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  headerText: { flex: 1 },
  title: { fontWeight: '600' },
  metaLine: { marginTop: 2 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  hero: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] },
  thumbnailFallback: {
    width: HERO_THUMBNAIL.width,
    height: HERO_THUMBNAIL.height,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDetails: { flex: 1, gap: spacing[2], justifyContent: 'center' },
  eyebrow: { fontWeight: '600', letterSpacing: 0.6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  statusText: { fontWeight: '600' },
  quote: { fontStyle: 'italic', marginTop: spacing[1] },
  divider: { height: StyleSheet.hairlineWidth, marginTop: spacing[3] },
  stats: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] },
  chart: { marginTop: spacing[3] },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[2],
  },
  footerChips: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  footerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 44,
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.full,
  },
  flex: { flex: 1 },
});
