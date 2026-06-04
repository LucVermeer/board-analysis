import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { ClimbQueueItem } from '@boardsesh/queue';
import type { Climb, SessionDetailTick, SessionFeedParticipant } from '@boardsesh/shared-schema';
import { getGradeTextColor } from '@boardsesh/play-view';
import { formatTickRelativeTime, tickTimeMs } from '@boardsesh/profile-stats';
import { Button } from '../../Button';
import { ClimbListItemContent } from '../../ClimbListItemContent';
import { EndSessionSheet } from '../../EndSessionSheet';
import { Icon } from '../../Icon';
import { Text } from '../../Text';
import { type IconName } from '../../icon-map';
import { useTheme } from '../../../providers/theme-provider';
import { useOptionalBluetoothContext } from '../../../providers/bluetooth-provider';
import { useQueue } from '../../../providers/queue-provider';
import { useDrawerHost } from '../../../providers/drawer-host-provider';
import { useSessionScreen } from '../../../providers/session-screen-provider';
import { useSessionDetail, useSessionSummary } from '../../../lib/graphql/hooks';
import { climbToQueueItem } from '../../../lib/climb-to-queue-item';
import { getBoardConfigForPlaylist } from '../../../lib/playlists/board-details-for-playlist';
import { navigateToSessionClimb } from '../../../lib/session-tick-mapping';
import { brandColors, withAlpha } from '../../../theme/colors';
import { iosSystemColors } from '../../../theme/ios-colors';
import { springs } from '../../../theme/animations';
import { borderRadius, spacing } from '../../../theme/tokens';
import { gradeBadgeColor, gradeSortValue } from '../../you/profile-chart-colors';
import { hapticSelection } from '../../../lib/haptics';
import { SessionAnalytics, type HardestSend } from './SessionAnalytics';
import { SessionLeaderboard } from './SessionLeaderboard';
import { SessionPresenceRow } from './SessionPresenceRow';

const DISMISS_DISTANCE_FRACTION = 0.18;
const DISMISS_VELOCITY = 800;

type InSessionViewProps = {
  /** Host overlay offset (0 = presented). The body pull-to-dismiss drives it. */
  translateY: SharedValue<number>;
  screenHeight: number;
};

type SessionHistoryStatus = 'attempt' | 'send' | 'flash';

const SESSION_HISTORY_STATUSES = new Set<string>(['attempt', 'send', 'flash']);

function isSessionHistoryStatus(status: string): status is SessionHistoryStatus {
  return SESSION_HISTORY_STATUSES.has(status);
}

function isSessionHistoryTick(tick: SessionDetailTick): tick is SessionDetailTick & { status: SessionHistoryStatus } {
  return isSessionHistoryStatus(tick.status);
}

function statusMeta(status: SessionHistoryStatus): { icon: IconName; tint: string } {
  switch (status) {
    case 'flash':
      return { icon: 'flash', tint: brandColors.warning };
    case 'send':
      return { icon: 'tick', tint: brandColors.success };
    case 'attempt':
      return { icon: 'circle', tint: iosSystemColors.systemGray };
  }
}

function tickToClimb(tick: SessionDetailTick): Climb | null {
  if (!tick.frames) return null;
  return {
    uuid: tick.climbUuid,
    name: tick.climbName ?? tick.climbUuid,
    frames: tick.frames,
    angle: tick.angle,
    ascensionist_count: 0,
    difficulty: tick.difficultyName ?? '',
    difficulty_error: '',
    quality_average: tick.quality != null ? String(tick.quality) : '0',
    setter_username: tick.setterUsername ?? '',
    stars: tick.quality ?? 0,
    benchmark_difficulty: tick.isBenchmark ? (tick.difficultyName ?? null) : null,
    mirrored: tick.isMirror,
    is_no_match: tick.isNoMatch,
    boardType: tick.boardType,
    layoutId: tick.layoutId,
  };
}

function tickToQueueItem(tick: SessionDetailTick): ClimbQueueItem | null {
  const climb = tickToClimb(tick);
  if (!climb) return null;
  return climbToQueueItem(climb, { uuid: randomUUID() });
}

type SessionHistoryRowProps = {
  tick: SessionDetailTick;
  status: SessionHistoryStatus;
  participant?: SessionFeedParticipant;
  onPress: (tick: SessionDetailTick) => void;
};

function SessionHistoryRow({ tick, status, participant, onPress }: SessionHistoryRowProps) {
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();
  const meta = statusMeta(status);
  let statusLabel: string;
  switch (status) {
    case 'flash':
      statusLabel = t('playView.tickBar.flashSaveLabel');
      break;
    case 'send':
      statusLabel = t('playView.tickBar.sendSaveLabel');
      break;
    case 'attempt':
      statusLabel = t('playView.tickBar.attemptLabel');
      break;
  }
  const climb = tickToClimb(tick);
  const boardConfig = tick.layoutId ? getBoardConfigForPlaylist(tick.boardType, tick.layoutId) : null;
  const subtitleParts = [
    participant?.displayName ?? null,
    status === 'flash' ? null : t('detail.attemptCount', { count: tick.attemptCount }),
    formatTickRelativeTime(tick.climbedAt),
  ].filter((part): part is string => !!part);
  const subtitle = subtitleParts.join(' · ');
  const gradeLabel = tick.difficultyName ?? null;

  const handlePress = () => {
    hapticSelection();
    onPress(tick);
  };

  return (
    <View>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.session.historyRowAria', {
          name: tick.climbName ?? t('detail.unknownClimb'),
          status: statusLabel,
        })}
        style={[styles.historyRow, { backgroundColor: systemColors.secondaryBackground }]}
      >
        <View style={styles.historyStatusSlot}>
          <View style={[styles.historyStatusIcon, { backgroundColor: withAlpha(meta.tint, 0.15) }]}>
            <Icon name={meta.icon} size={14} color={meta.tint} />
          </View>
        </View>

        {climb && boardConfig ? (
          <ClimbListItemContent
            climb={climb}
            boardName={boardConfig.boardName}
            layoutId={boardConfig.layoutId}
            sizeId={boardConfig.sizeId}
            setIds={boardConfig.setIds.join(',')}
            angle={tick.angle}
          />
        ) : (
          <>
            <View style={styles.historyTextColumn}>
              <Text variant="body" numberOfLines={1} style={styles.historyClimbName}>
                {tick.climbName ?? t('detail.unknownClimb')}
              </Text>
              <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            {gradeLabel ? (
              <View style={[styles.historyGradePill, { backgroundColor: gradeBadgeColor(gradeLabel) }]}>
                <Text
                  variant="caption1"
                  color={getGradeTextColor(gradeBadgeColor(gradeLabel))}
                  style={styles.historyGradeText}
                >
                  {gradeLabel}
                </Text>
              </View>
            ) : null}
          </>
        )}

        <View style={[styles.historyStatusPill, { backgroundColor: withAlpha(meta.tint, 0.15) }]}>
          <Text variant="caption1" color={meta.tint} style={styles.historyStatusLabel}>
            {statusLabel}
          </Text>
        </View>
      </Pressable>
      <View style={[styles.historySeparator, { backgroundColor: systemColors.separator }]} />
    </View>
  );
}

export function InSessionView({ translateY, screenHeight }: InSessionViewProps) {
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const bluetooth = useOptionalBluetoothContext();
  const { close } = useSessionScreen();
  const { openPlayDrawer } = useDrawerHost();
  const { sessionId, liveStats, sessionUsers, driverParticipantId, participantId, setCurrentClimb, endSession } =
    useQueue();

  // Seed the live view from the full session detail (rich grade split, flashes,
  // per-participant flashes, and the tick list used for hardest-send names and
  // session history). `liveStats` overlays the seed so aggregates update without
  // polling.
  const detailQuery = useSessionDetail(sessionId ?? undefined);
  const detail = detailQuery.data;

  // Only trust a live push that belongs to the CURRENT session. After a direct
  // A->B session switch the provider resets liveStats, but this guards the
  // window (and any late A push) so we never attribute the previous session's
  // numbers to this one.
  const live = liveStats && liveStats.sessionId === sessionId ? liveStats : null;

  // startedAt isn't carried by the live push, so the ticking timer reads it from
  // a single summary query.
  const summaryQuery = useSessionSummary(sessionId);
  const startedAt = summaryQuery.data?.startedAt ?? null;

  // Refresh detail whenever live tick aggregates move so the history list and
  // hardest-send names catch the newly logged tick.
  const liveTickCount = live?.tickCount ?? null;
  const liveHardestGrade = live?.hardestGrade ?? null;
  useEffect(() => {
    if (!sessionId) return;
    if (liveTickCount == null && !liveHardestGrade) return;
    void queryClient.invalidateQueries({ queryKey: ['sessionDetail', sessionId] });
  }, [sessionId, liveTickCount, liveHardestGrade, queryClient]);

  // Live push takes precedence over the seed for every aggregate.
  const sends = live?.totalSends ?? detail?.totalSends ?? 0;
  const flashes = live?.totalFlashes ?? detail?.totalFlashes ?? 0;
  const gradeDistribution = live?.gradeDistribution ?? detail?.gradeDistribution ?? [];
  const participants = live?.participants ?? detail?.participants ?? [];
  const hardestGrade = live?.hardestGrade ?? detail?.hardestGrade ?? null;

  const isMultiUser = participants.length > 1;

  // Hardest send(s) to celebrate. Solo: the session's single hardest (grade from
  // the aggregate, climb name mined from the tick list). Party: each climber's
  // own hardest send, hardest first, so everyone's effort shows with their face.
  const hardestSends = useMemo<HardestSend[]>(() => {
    const sendTicks = (detail?.ticks ?? []).filter((tick) => tick.status !== 'attempt');
    if (!isMultiUser) {
      if (!hardestGrade) return [];
      let bestName: string | null = null;
      let bestDifficulty = -Infinity;
      for (const tick of sendTicks) {
        const difficulty = tick.difficulty ?? -Infinity;
        if (difficulty > bestDifficulty) {
          bestDifficulty = difficulty;
          bestName = tick.climbName ?? null;
        }
      }
      return [{ grade: hardestGrade, climbName: bestName }];
    }
    const bestByUser = new Map<string, SessionDetailTick>();
    for (const tick of sendTicks) {
      const current = bestByUser.get(tick.userId);
      if (!current || (tick.difficulty ?? -Infinity) > (current.difficulty ?? -Infinity)) {
        bestByUser.set(tick.userId, tick);
      }
    }
    return [...bestByUser.entries()]
      .map(([userId, tick]) => {
        const participant = participants.find((entry) => entry.userId === userId);
        return {
          userId,
          displayName: participant?.displayName ?? null,
          avatarUrl: participant?.avatarUrl ?? null,
          grade: tick.difficultyName ?? '',
          climbName: tick.climbName,
        };
      })
      .filter((entry) => entry.grade)
      .sort((first, second) => gradeSortValue(second.grade) - gradeSortValue(first.grade));
  }, [detail?.ticks, participants, isMultiUser, hardestGrade]);

  const sessionHistoryTicks = useMemo(
    () =>
      (detail?.ticks ?? [])
        .filter(isSessionHistoryTick)
        .sort((first, second) => tickTimeMs(second.climbedAt) - tickTimeMs(first.climbedAt)),
    [detail?.ticks],
  );

  // Our own database user id (for the "you" highlight in the leaderboard).
  // Undefined when we can't resolve it; the leaderboard handles that.
  const selfUserId = useMemo(
    () => sessionUsers.find((user) => user.id === participantId)?.userId ?? null,
    [sessionUsers, participantId],
  );

  const canControlWall = bluetooth?.isConnected === true || (!!participantId && participantId === driverParticipantId);

  const participantByUserId = useMemo(() => {
    const entries = new Map<string, SessionFeedParticipant>();
    for (const participant of participants) {
      entries.set(participant.userId, participant);
    }
    return entries;
  }, [participants]);

  const handlePressHistoryTick = useCallback(
    (tick: SessionDetailTick) => {
      const climb = tickToClimb(tick);
      const boardConfig = getBoardConfigForPlaylist(tick.boardType, tick.layoutId);

      if (canControlWall) {
        const item = tickToQueueItem(tick);
        if (item) {
          setCurrentClimb(item);
        }
      }

      if (climb && boardConfig) {
        openPlayDrawer(climb, {
          setAsCurrent: false,
          boardConfig: {
            boardName: boardConfig.boardName,
            layoutId: boardConfig.layoutId,
            sizeId: boardConfig.sizeId,
            setIds: boardConfig.setIds.join(','),
            angle: tick.angle,
          },
        });
        return;
      }

      navigateToSessionClimb(router, tick);
    },
    [canControlWall, openPlayDrawer, router, setCurrentClimb],
  );

  // Swipe-down-to-dismiss from the body. Drag the sheet only when the inner
  // scroll is at the top and the pull is downward; otherwise the scroll handles
  // it. Drives the host's translateY, and on release either dismisses or springs
  // back to fully presented.
  const scrollOffset = useSharedValue(0);
  const startedAtTop = useSharedValue(true);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.y;
  });
  const scrollGesture = useMemo(() => Gesture.Native(), []);
  const dismissGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(12)
        .onStart(() => {
          startedAtTop.value = scrollOffset.value <= 0;
        })
        .onUpdate((event) => {
          if (startedAtTop.value && event.translationY > 0) {
            translateY.value = event.translationY;
          }
        })
        .onEnd((event) => {
          if (!startedAtTop.value) return;
          if (translateY.value > screenHeight * DISMISS_DISTANCE_FRACTION || event.velocityY > DISMISS_VELOCITY) {
            runOnJS(close)();
          } else {
            translateY.value = withSpring(0, springs.gentle);
          }
        })
        .simultaneousWithExternalGesture(scrollGesture),
    [translateY, screenHeight, close, scrollOffset, startedAtTop, scrollGesture],
  );

  const [showEndSession, setShowEndSession] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const handleConfirmEnd = useCallback(async () => {
    setIsEnding(true);
    const summary = await endSession();
    setIsEnding(false);
    setShowEndSession(false);
    if (summary) {
      // Close the overlay before pushing the summary so the modal-presented
      // summary route lands on a stable underlying tab.
      close();
      router.push({ pathname: '/(tabs)/record/summary', params: { sessionId: summary.sessionId } });
    }
  }, [endSession, close, router]);

  return (
    <GestureDetector gesture={dismissGesture}>
      <View style={styles.container}>
        <GestureDetector gesture={scrollGesture}>
          <Animated.ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, { paddingBottom: 100 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            bounces={false}
          >
            <SessionPresenceRow
              users={sessionUsers}
              driverParticipantId={driverParticipantId}
              selfParticipantId={participantId}
            />

            <SessionAnalytics
              sends={sends}
              flashes={flashes}
              hardestGrade={hardestGrade}
              hardestSends={hardestSends}
              startedAt={startedAt}
              gradeDistribution={gradeDistribution}
            />

            <View style={styles.historySection}>
              <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionLabel}>
                {t('mobile.session.inHistoryTitle')}
              </Text>
              {sessionHistoryTicks.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: systemColors.secondaryBackground }]}>
                  <Text variant="body" color={systemColors.secondaryLabel}>
                    {t('mobile.session.inHistoryEmpty')}
                  </Text>
                </View>
              ) : (
                <View style={[styles.historyList, { backgroundColor: systemColors.secondaryBackground }]}>
                  {sessionHistoryTicks.map((tick) => (
                    <SessionHistoryRow
                      key={tick.uuid}
                      tick={tick}
                      status={tick.status}
                      participant={participantByUserId.get(tick.userId)}
                      onPress={handlePressHistoryTick}
                    />
                  ))}
                </View>
              )}
            </View>

            <SessionLeaderboard
              participants={participants}
              driverParticipantId={driverParticipantId}
              selfUserId={selfUserId}
            />
          </Animated.ScrollView>
        </GestureDetector>

        <View
          style={[
            styles.footer,
            { backgroundColor: systemColors.background, paddingBottom: insets.bottom + spacing[3] },
          ]}
        >
          <Button
            title={t('mobile.session.inEndSession')}
            onPress={() => setShowEndSession(true)}
            variant="outlined"
            size="large"
          />
        </View>

        <EndSessionSheet
          visible={showEndSession}
          onDismiss={() => setShowEndSession(false)}
          onConfirm={() => void handleConfirmEnd()}
          isEnding={isEnding}
          climbCount={sessionHistoryTicks.length}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    gap: spacing[5],
  },
  historySection: {
    gap: spacing[2],
  },
  sectionLabel: {
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0,
  },
  historyList: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing[3],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  historyStatusSlot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyStatusIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyTextColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  historyClimbName: {
    fontWeight: '600',
  },
  historyGradePill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    flexShrink: 0,
  },
  historyGradeText: {
    fontWeight: '700',
  },
  historyStatusPill: {
    flexShrink: 0,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  historyStatusLabel: {
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  historySeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing[3] + 28 + spacing[3],
  },
  emptyCard: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
  },
  footer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
});
