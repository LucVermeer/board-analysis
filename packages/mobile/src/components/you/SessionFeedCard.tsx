import { memo, useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { isBetaVideoUrl, isInstagramUrl, isTikTokUrl } from '@boardsesh/shared-schema';
import type {
  BetaLink,
  BoardName,
  SessionFeedItem,
  SessionFeedTickHighlight,
  SocialEntityType,
} from '@boardsesh/shared-schema';
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
import { MetricChip } from './MetricChip';
import { buildSessionGradeBars, gradeBadgeColor } from './profile-chart-colors';
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

/** Hero media cell — sized for a portrait beta thumbnail / enlarged board art. */
const HERO_MEDIA = { width: 84, height: 104 } as const;

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

function detectPlatform(url: string): { icon: IconName } | null {
  if (isInstagramUrl(url)) return { icon: 'instagram' };
  if (isTikTokUrl(url)) return { icon: 'tiktok' };
  return null;
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

  // Beta video is the more engaging content, so it wins the hero when present —
  // the climb's board art only takes the hero when there's no beta to show.
  const featuredBeta = session.featuredBeta ?? null;
  const betaLink = featuredBeta ? mapBetaLink(featuredBeta.betaLink) : null;
  const betaUrl = betaLink?.link ?? null;

  // When the hero is the hardest send it already shows that grade, so the stats
  // "hardest" chip would just repeat it. Keep the chip only when the hero is the
  // beta video (its grade is the beta climb's, not necessarily the session
  // hardest) or there's no hardest-send hero at all.
  const heroIsHardestSend = !(featuredBeta && betaLink) && !!hardestSend;

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

  const handleToggleChart = useCallback(() => {
    hapticLight();
    setChartExpanded((expanded) => !expanded);
  }, []);

  const heroClimbLabel = hardestSend
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
        {/* Header opens the SESSION; the hero opens the beta video (when present)
            or the hardest-send CLIMB. Two tap targets so session detail stays
            reachable. */}
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

        {featuredBeta && betaLink ? (
          <PressableSurface
            onPress={handleOpenBeta}
            feedback="opacity"
            accessibilityRole="link"
            accessibilityLabel={t('mobile.home.betaCardLabel')}
            style={styles.heroPressable}
          >
            <BetaHero betaLink={betaLink} tick={featuredBeta.tick} />
          </PressableSurface>
        ) : hardestSend ? (
          <PressableSurface
            onPress={handleHeroPress}
            feedback="opacity"
            accessibilityRole="button"
            accessibilityLabel={heroClimbLabel}
            accessibilityHint={t('sessionFeedCard.openHint')}
            style={styles.heroPressable}
          >
            <HeroSend tick={hardestSend} />
          </PressableSurface>
        ) : null}

        <View style={[styles.divider, { backgroundColor: systemColors.separator }]} />

        <SessionStats
          session={session}
          displayHardestGrade={displayHardestGrade}
          showHardestChip={!heroIsHardestSend}
        />

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

        <View style={[styles.divider, { backgroundColor: systemColors.separator }]} />

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
          {/* Icon-only so a long label can't push the chip off-screen. */}
          <PressableSurface
            onPress={handleToggleChart}
            feedback="opacity"
            accessibilityRole="button"
            accessibilityLabel={t('sessionFeedCard.chartLabel')}
            accessibilityState={{ selected: chartExpanded }}
            style={[styles.chartToggle, chartExpanded ? { backgroundColor: systemColors.fill } : null]}
          >
            <Icon
              name="chart.bar"
              size={18}
              color={chartExpanded ? brandColors.primary : systemColors.secondaryLabel}
            />
          </PressableSurface>
        </View>
      </Card>
    </View>
  );
});

/** Beta-video hero: the Instagram/TikTok thumbnail + the climb it's beta for. */
const BetaHero = memo(function BetaHero({ betaLink, tick }: { betaLink: BetaLink; tick: SessionFeedTickHighlight }) {
  const { t } = useTranslation('feed');
  const { systemColors, brandColors } = useTheme();
  const { formatGrade } = useGradeFormat();
  const [imageFailed, setImageFailed] = useState(false);

  const platform = detectPlatform(betaLink.link);
  const username = betaLink.foreign_username?.trim();
  const displayGrade = tick.difficultyName ? (formatGrade(tick.difficultyName) ?? tick.difficultyName) : null;

  return (
    <View style={styles.hero}>
      <View style={styles.betaMedia}>
        {betaLink.thumbnail && !imageFailed ? (
          <Image
            source={{ uri: betaLink.thumbnail }}
            style={styles.media}
            contentFit="cover"
            transition={150}
            recyclingKey={betaLink.thumbnail}
            onError={() => setImageFailed(true)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.media, styles.mediaFallback, { backgroundColor: systemColors.fill }]}>
            <Icon name="video" size={26} color={systemColors.tertiaryLabel} />
          </View>
        )}
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playBadge}>
            <Icon name="play.fill" size={22} color="#FFFFFF" />
          </View>
        </View>
        {platform ? (
          <View style={styles.platformBadge}>
            <Icon name={platform.icon} size={13} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <View style={styles.heroDetails}>
        <Text variant="caption1" color={brandColors.primary} style={styles.betaEyebrow}>
          {t('sessionFeedCard.betaEyebrow').toUpperCase()}
        </Text>
        <View style={styles.nameRow}>
          <Text variant="title3" numberOfLines={2} style={styles.flex}>
            {tick.climbName ?? t('sessionFeedCard.unknownClimb')}
          </Text>
          {displayGrade ? (
            <Text
              variant="title3"
              style={[styles.gradeText, { color: gradeBadgeColor(tick.difficultyName ?? displayGrade) }]}
            >
              {displayGrade}
            </Text>
          ) : null}
        </View>
        {username ? (
          <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1}>
            @{username}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

/** Hero for sessions with no beta: enlarged board art + the hardest send. */
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
          size={HERO_MEDIA}
        />
      ) : (
        <View style={[styles.media, styles.mediaFallback, { backgroundColor: systemColors.fill }]}>
          <Icon name="lightbulb" size={26} color={systemColors.tertiaryLabel} />
        </View>
      )}
      <View style={styles.heroDetails}>
        <Text variant="caption2" color={systemColors.tertiaryLabel} style={styles.eyebrow}>
          {t('sessionFeedCard.hardestSend').toUpperCase()}
        </Text>
        <View style={styles.nameRow}>
          <Text variant="title3" numberOfLines={2} style={styles.flex}>
            {tick.climbName ?? t('sessionFeedCard.unknownClimb')}
          </Text>
          {displayGrade ? (
            <Text
              variant="title3"
              style={[styles.gradeText, { color: gradeBadgeColor(tick.difficultyName ?? displayGrade) }]}
            >
              {displayGrade}
            </Text>
          ) : null}
        </View>
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
  showHardestChip,
}: {
  session: SessionFeedItem;
  displayHardestGrade: string | null;
  showHardestChip: boolean;
}) {
  const { t } = useTranslation('feed');
  return (
    <View style={styles.stats}>
      <MetricChip
        value={String(session.totalSends)}
        label={nounFromCountLabel(t('sessionFeedCard.sendsCount', { count: session.totalSends }))}
      />
      {displayHardestGrade && showHardestChip ? (
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
  goal: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[2] },
  hero: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] },
  media: { width: HERO_MEDIA.width, height: HERO_MEDIA.height, borderRadius: borderRadius.md },
  mediaFallback: { alignItems: 'center', justifyContent: 'center' },
  betaMedia: { width: HERO_MEDIA.width, height: HERO_MEDIA.height, borderRadius: borderRadius.md, overflow: 'hidden' },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDetails: { flex: 1, gap: spacing[1], justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  gradeText: { fontWeight: '700' },
  eyebrow: { fontWeight: '600', letterSpacing: 0.6 },
  betaEyebrow: { fontWeight: '700', letterSpacing: 0.6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  statusText: { fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginTop: spacing[2] },
  stats: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] },
  chart: { marginTop: spacing[2] },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[2],
  },
  chartToggle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  flex: { flex: 1 },
});
