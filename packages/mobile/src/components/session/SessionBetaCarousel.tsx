import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SessionDetailTick } from '@boardsesh/shared-schema';
import { SectionHeader } from '../SectionHeader';
import { betaLinkIdentity, dedupeBetaLinks, isBetaVideoUrl, mapBetaLinks } from '../../lib/beta-video-url';
import { spacing } from '../../theme/tokens';
import { BetaVideoCard, BETA_CARD_WIDTH } from '../play-drawer/BetaVideoCard';

type SessionBetaCarouselProps = {
  ticks: SessionDetailTick[];
};

const CARD_GAP = spacing[3];

/**
 * Beta-video shelf for the session detail screen. Aggregates every tick's beta
 * links, keeps only valid Instagram/TikTok URLs, dedupes them across the
 * session, and renders a horizontal snap carousel. The list is bounded (one
 * deduped set per session), so a plain ScrollView matches BetaVideosSection.
 * Self-hides when there's nothing to show.
 */
export function SessionBetaCarousel({ ticks }: SessionBetaCarouselProps) {
  const { t } = useTranslation('session');

  const betaLinks = useMemo(() => {
    const mapped = mapBetaLinks(ticks.flatMap((tick) => tick.betaLinks ?? []));
    const videos = mapped.filter((betaLink) => isBetaVideoUrl(betaLink.link));
    return dedupeBetaLinks(videos);
  }, [ticks]);

  if (betaLinks.length === 0) return null;

  return (
    <View>
      <SectionHeader title={t('mobile.betaVideos.title')} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={BETA_CARD_WIDTH + CARD_GAP}
        decelerationRate="fast"
        snapToAlignment="start"
      >
        {betaLinks.map((betaLink) => (
          <BetaVideoCard key={betaLinkIdentity(betaLink.link)} link={betaLink} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: CARD_GAP,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1],
  },
});
