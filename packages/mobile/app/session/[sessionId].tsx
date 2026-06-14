import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import type BottomSheet from '@gorhom/bottom-sheet';
import type { SessionDetailTick, SessionFeedParticipant, SocialEntityType } from '@boardsesh/shared-schema';
import { formatTickAbsoluteTime } from '@boardsesh/profile-stats';
import { Text } from '../../src/components/Text';
import { Icon } from '../../src/components/Icon';
import { ActivityIndicator } from '../../src/components/ActivityIndicator';
import { SectionHeader } from '../../src/components/SectionHeader';
import { FeedSocialRow } from '../../src/components/you/FeedSocialRow';
import { CommentSheet } from '../../src/components/you/CommentSheet';
import { SessionDetailHero } from '../../src/components/session/SessionDetailHero';
import { SessionStatTiles } from '../../src/components/session/SessionStatTiles';
import { SessionAnalyticsSection } from '../../src/components/session/SessionAnalyticsSection';
import { SessionBetaCarousel } from '../../src/components/session/SessionBetaCarousel';
import { SessionParticipantBreakdown } from '../../src/components/session/SessionParticipantBreakdown';
import { SessionTickRow } from '../../src/components/session/SessionTickRow';
import { useSessionDetail } from '../../src/lib/graphql/hooks';
import { openClimbInPlayDrawer } from '../../src/lib/open-climb-in-play-drawer';
import { useBottomChromeMetrics } from '../../src/hooks/use-bottom-chrome-metrics';
import { useDrawerHost } from '../../src/providers/drawer-host-provider';
import { spacing } from '../../src/theme/tokens';
import { useTheme } from '../../src/providers/theme-provider';

// Hoisted so FlashList gets a stable reference across renders.
const keyExtractor = (tick: SessionDetailTick) => tick.uuid;

export default function SessionDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const { openPlayDrawer } = useDrawerHost();
  const bottomChrome = useBottomChromeMetrics();
  const paddingBottom = bottomChrome.scrollBottomPadding + spacing[6];

  const { data: session, isPending } = useSessionDetail(sessionId);

  const commentSheetRef = useRef<BottomSheet | null>(null);
  const [commentTarget, setCommentTarget] = useState<{ entityId: string; entityType: SocialEntityType } | null>(null);

  // Session name, falling back to a generated "<date>" label when unnamed.
  const title = useMemo(() => {
    if (!session) return '';
    if (session.sessionName) return session.sessionName;
    return formatTickAbsoluteTime(session.lastTickAt, 'MMM D, YYYY');
  }, [session]);

  const isMultiUser = (session?.participants.length ?? 0) > 1;
  const participantById = useMemo(() => {
    const map = new Map<string, SessionFeedParticipant>();
    for (const participant of session?.participants ?? []) map.set(participant.userId, participant);
    return map;
  }, [session]);

  const openComments = useCallback((entityId: string, entityType: SocialEntityType) => {
    setCommentTarget({ entityId, entityType });
    commentSheetRef.current?.snapToIndex(0);
  }, []);

  const handleOpenSessionComments = useCallback((id: string) => openComments(id, 'session'), [openComments]);
  const handleOpenTickComments = useCallback((tickUuid: string) => openComments(tickUuid, 'tick'), [openComments]);

  const handleTickPress = useCallback(
    (tick: SessionDetailTick) => openClimbInPlayDrawer({ kind: 'tick', tick }, { openPlayDrawer, router }),
    [openPlayDrawer, router],
  );

  // Stable per-row factory so the memoized `SessionTickRow`s keep their identity
  // across re-renders — a fresh inline arrow would force FlashList to re-evaluate
  // every visible item each pass.
  const renderItem = useCallback(
    ({ item }: { item: SessionDetailTick }) => (
      <SessionTickRow
        tick={item}
        isMultiUser={isMultiUser}
        participant={participantById.get(item.userId)}
        onPress={handleTickPress}
        onOpenComments={handleOpenTickComments}
      />
    ),
    [isMultiUser, participantById, handleTickPress, handleOpenTickComments],
  );

  // Header title follows the loaded session name/date.
  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: title || t('mobileDetail.title'),
    });
  }, [navigation, title, t]);

  if (isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.centered}>
        <Icon name="history" size={48} color={systemColors.tertiaryLabel} />
        <Text variant="headline" color={systemColors.secondaryLabel} style={styles.notFound}>
          {t('mobileDetail.notFound')}
        </Text>
      </View>
    );
  }

  const header = (
    <View>
      <SessionDetailHero session={session} title={title} />
      <SessionStatTiles
        sends={session.totalSends}
        flashes={session.totalFlashes}
        attempts={session.totalAttempts}
        hardestGrade={session.hardestGrade}
      />

      <SessionAnalyticsSection gradeDistribution={session.gradeDistribution} />

      <SessionBetaCarousel ticks={session.ticks} />

      <SessionParticipantBreakdown participants={session.participants} />

      <View style={styles.social}>
        <FeedSocialRow
          entityId={session.sessionId}
          upvotes={session.upvotes}
          userVote={null}
          commentCount={session.commentCount}
          onOpenComments={handleOpenSessionComments}
        />
      </View>

      <SectionHeader title={t('detail.climbsCount', { count: session.ticks.length })} />
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: systemColors.groupedBackground }]}>
      <FlashList
        data={session.ticks}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom }}
      />

      <CommentSheet
        sheetRef={commentSheetRef}
        entityId={commentTarget?.entityId ?? null}
        entityType={commentTarget?.entityType ?? 'session'}
        onClose={() => setCommentTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3], paddingHorizontal: spacing[8] },
  notFound: { textAlign: 'center' },
  social: { paddingHorizontal: spacing[4], marginTop: spacing[2] },
});
