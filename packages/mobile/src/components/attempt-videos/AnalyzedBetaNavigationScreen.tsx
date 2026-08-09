import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import type {
  AnalyzedBetaMoveAttempt,
  AnalyzedBetaMoveSummary,
  Climb,
  ClimbSearchInput,
} from '@boardsesh/shared-schema';
import { useInfiniteSearchClimbs } from '../../lib/graphql/hooks/use-infinite-search-climbs';
import { usePrivateAttemptVideos } from '../../lib/graphql/hooks';
import { getHttpClient } from '../../lib/graphql/client';
import { GET_CLIMB, type GetClimbQueryResponse, type GetClimbQueryVariables } from '../../lib/graphql/operations';
import { useTheme } from '../../providers/theme-provider';
import { useBottomChromeMetrics } from '../../hooks/use-bottom-chrome-metrics';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ActivityIndicator } from '../ActivityIndicator';
import { spacing, borderRadius } from '../../theme/tokens';
import {
  analysisVideoUrl,
  fetchAnalyzedClimbIds,
  fetchClimbAnalysisAvailability,
  fetchClimbAnalysisNavigation,
  fetchClimbMoveAttempts,
} from '../../lib/analyzed-beta-analysis-client';
import { buildAnalyzedBetaNavigationItems, type AnalyzedBetaNavigationItem } from '../../lib/analyzed-beta-navigation';
import { attemptSwipeOffset } from '../../lib/private-attempt-loop';
import { listLocalAttemptVideos, localAttemptVideosQueryKey } from '../../lib/local-attempt-videos';
import { useSetting } from '../../settings/hooks';
import { PrivateAttemptComparison } from './PrivateAttemptComparison';

const SPEEDS = [0.25, 0.5, 1] as const;
const SEARCH_DELAY_MS = 250;
const CONTROLS_HIDE_DELAY_MS = 2_500;

function holdLabel(key: string): string {
  return key.replace(/^grid:/, '');
}

function targetLabel(move: AnalyzedBetaMoveSummary): string {
  return move.targetHolds.map((hold) => holdLabel(hold.key)).join(' + ');
}

function handLabel(hand: string): string {
  if (hand === 'left_hand') return 'LH';
  if (hand === 'right_hand') return 'RH';
  return hand;
}

function transitionLabel(attempt: AnalyzedBetaMoveAttempt): string {
  return attempt.transitions
    .map(
      (transition) =>
        `${handLabel(transition.hand)} ${holdLabel(transition.source.key)} → ${holdLabel(transition.destination.key)}`,
    )
    .join(' + ');
}

export function AnalyzedBetaNavigationScreen() {
  const routeParams = useLocalSearchParams<{ climb?: string | string[] }>();
  const requestedClimbId = Array.isArray(routeParams.climb) ? routeParams.climb[0] : routeParams.climb;
  const { t } = useTranslation('climbs');
  const { t: tCommon } = useTranslation('common');
  const { systemColors, brandColors } = useTheme();
  const bottomChrome = useBottomChromeMetrics();
  const { width, height } = useWindowDimensions();
  const wideLayout = width >= 600;
  const landscapeLayout = width > height;
  const [selectedClimb, setSelectedClimb] = useState<Climb | null>(null);
  const [moveKey, setMoveKey] = useState('all');
  const [videoId, setVideoId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [chooserOpen, setChooserOpen] = useState(true);
  const [speed, setSpeed] = useSetting('analysisPlaybackSpeed');
  const speedRef = useRef<(typeof SPEEDS)[number]>(speed);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [betaFullscreen, setBetaFullscreen] = useState(false);
  const [betaControlsVisible, setBetaControlsVisible] = useState(false);
  const [betaPlaying, setBetaPlaying] = useState(false);
  const [recordingIndex, setRecordingIndex] = useState(0);
  const segmentEndRef = useRef<number | null>(null);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedRouteClimbRef = useRef<string | undefined>(undefined);

  const hideBetaControls = useCallback(() => {
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = null;
    setBetaControlsVisible(false);
  }, []);

  const showBetaControls = useCallback(() => {
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    setBetaControlsVisible(true);
    controlsHideTimerRef.current = setTimeout(() => {
      controlsHideTimerRef.current = null;
      setBetaControlsVisible(false);
    }, CONTROLS_HIDE_DELAY_MS);
  }, []);

  useEffect(() => hideBetaControls, [hideBetaControls]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const searchInput = useMemo<ClimbSearchInput>(
    () => ({
      boardName: 'moonboard',
      layoutId: 3,
      sizeId: 1,
      setIds: '5,6,7,8,9,10',
      angle: 40,
      pageSize: 50,
      sortBy: 'ascents',
      sortOrder: 'desc',
      ...(debouncedSearch ? { name: debouncedSearch } : {}),
    }),
    [debouncedSearch],
  );
  const climbsQuery = useInfiniteSearchClimbs(searchInput, true, { staleTime: 5 * 60_000 });
  const catalogClimbs = useMemo(() => climbsQuery.data?.pages.flatMap((page) => page.climbs) ?? [], [climbsQuery.data]);
  const analyzedClimbIdsQuery = useQuery({
    queryKey: ['deviceAnalyzedClimbIds'],
    queryFn: fetchAnalyzedClimbIds,
    staleTime: 60_000,
    retry: 1,
  });
  const analyzedClimbIds = analyzedClimbIdsQuery.data ?? [];
  const analyzedClimbQueries = useQueries({
    queries: analyzedClimbIds.map((climbUuid) => {
      const variables: GetClimbQueryVariables = {
        boardName: 'moonboard',
        layoutId: 3,
        sizeId: 1,
        setIds: '5,6,7,8,9,10',
        angle: 40,
        climbUuid,
      };
      return {
        queryKey: ['climb', variables],
        queryFn: async () => (await getHttpClient().request<GetClimbQueryResponse>(GET_CLIMB, variables)).climb,
        staleTime: 5 * 60_000,
      };
    }),
  });
  const analyzedClimbs = analyzedClimbQueries.flatMap((query) => (query.data ? [query.data] : []));
  const analyzedClimbIdSet = useMemo(() => new Set(analyzedClimbIds), [analyzedClimbIds]);
  const climbs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const matchingAnalyzed = query
      ? analyzedClimbs.filter((climb) =>
          `${climb.name} ${climb.difficulty} ${climb.setter_username}`.toLocaleLowerCase().includes(query),
        )
      : analyzedClimbs;
    const seen = new Set(matchingAnalyzed.map((climb) => climb.uuid));
    return [...matchingAnalyzed, ...catalogClimbs.filter((climb) => !seen.has(climb.uuid))];
  }, [analyzedClimbs, catalogClimbs, search]);

  useEffect(() => {
    if (!requestedClimbId) appliedRouteClimbRef.current = undefined;
    if (requestedClimbId && appliedRouteClimbRef.current !== requestedClimbId) {
      const requestedClimb = analyzedClimbs.find((climb) => climb.uuid === requestedClimbId);
      if (requestedClimb) {
        if (selectedClimb?.uuid !== requestedClimb.uuid) {
          segmentEndRef.current = null;
          setSelectedClimb(requestedClimb);
          setMoveKey('all');
          setVideoId('');
          setBetaFullscreen(false);
          setComparisonOpen(false);
          setRecordingIndex(0);
        }
        appliedRouteClimbRef.current = requestedClimbId;
        setChooserOpen(false);
        return;
      }

      const requestedIndex = analyzedClimbIds.indexOf(requestedClimbId);
      const requestedStillLoading =
        analyzedClimbIdsQuery.isLoading ||
        (requestedIndex >= 0 && (analyzedClimbQueries[requestedIndex]?.isLoading ?? false));
      if (requestedStillLoading) return;
      appliedRouteClimbRef.current = requestedClimbId;
    }

    if (selectedClimb) return;
    if (analyzedClimbs[0]) {
      setSelectedClimb(analyzedClimbs[0]);
      return;
    }
    const analyzedCatalogueLoaded =
      !analyzedClimbIdsQuery.isLoading && !analyzedClimbQueries.some((query) => query.isLoading);
    if (analyzedCatalogueLoaded && catalogClimbs[0]) setSelectedClimb(catalogClimbs[0]);
  }, [
    analyzedClimbIds,
    analyzedClimbIdsQuery.isLoading,
    analyzedClimbQueries,
    analyzedClimbs,
    catalogClimbs,
    requestedClimbId,
    selectedClimb,
  ]);

  const availabilityQuery = useQuery({
    queryKey: ['deviceClimbAnalysisAvailability', selectedClimb?.uuid],
    queryFn: () => fetchClimbAnalysisAvailability(selectedClimb!.uuid),
    enabled: !!selectedClimb,
    staleTime: 60_000,
    retry: 1,
  });
  const privateVideosQuery = usePrivateAttemptVideos(selectedClimb?.uuid ?? '', 3, selectedClimb?.angle ?? 40, {
    enabled: !!selectedClimb,
  });
  const localVideosQuery = useQuery({
    queryKey: localAttemptVideosQueryKey(selectedClimb?.uuid ?? '', 3, selectedClimb?.angle ?? 40),
    queryFn: () => listLocalAttemptVideos(selectedClimb!.uuid, 3, selectedClimb!.angle ?? 40),
    enabled: !!selectedClimb,
  });
  const privateVideos = useMemo(
    () => [...(localVideosQuery.data ?? []), ...(privateVideosQuery.data ?? [])],
    [localVideosQuery.data, privateVideosQuery.data],
  );

  useEffect(() => {
    setRecordingIndex((current) => Math.min(current, Math.max(0, privateVideos.length - 1)));
    if (privateVideos.length === 0) setComparisonOpen(false);
  }, [privateVideos.length]);

  const availability = availabilityQuery.data;
  const analysisClimbId = availability?.analysisClimbId ?? '';
  const hasMoveAnalysis = availability?.videos.some((video) => video.hasMoveAnalysis) ?? false;
  const navigationQuery = useQuery({
    queryKey: ['deviceClimbAnalysisNavigation', analysisClimbId],
    queryFn: () => fetchClimbAnalysisNavigation(analysisClimbId),
    enabled: !!analysisClimbId && hasMoveAnalysis,
    staleTime: 60_000,
    retry: 1,
  });
  const attemptsQuery = useQuery({
    queryKey: ['deviceClimbMoveAttempts', analysisClimbId, moveKey],
    queryFn: () => fetchClimbMoveAttempts(analysisClimbId, moveKey),
    enabled: !!analysisClimbId && moveKey !== 'all',
    staleTime: 60_000,
    retry: 1,
  });

  const videos = availability?.videos ?? [];
  const allowedVideoIds = useMemo(() => new Set(videos.map((video) => video.id)), [videos]);
  const attempts = useMemo(
    () => (attemptsQuery.data ?? []).filter((attempt) => allowedVideoIds.has(attempt.videoId)),
    [allowedVideoIds, attemptsQuery.data],
  );
  const navigationItems = useMemo<AnalyzedBetaNavigationItem[]>(
    () => buildAnalyzedBetaNavigationItems(videos, attempts, moveKey),
    [attempts, moveKey, videos],
  );

  useEffect(() => {
    if (navigationItems.length === 0) {
      setVideoId('');
      return;
    }
    setVideoId((current) =>
      navigationItems.some((item) => item.video.id === current) ? current : (navigationItems[0]?.video.id ?? ''),
    );
  }, [navigationItems]);

  const currentIndex = navigationItems.findIndex((item) => item.video.id === videoId);
  const currentItem = currentIndex >= 0 ? navigationItems[currentIndex] : null;
  const currentVideo = currentItem?.video ?? null;
  const currentAttempt = currentItem?.attempt ?? null;
  const navigation = navigationQuery.data;

  useEffect(() => {
    if (!currentVideo) setBetaFullscreen(false);
  }, [currentVideo]);

  useEffect(() => {
    hideBetaControls();
  }, [betaFullscreen, hideBetaControls, moveKey, videoId]);

  const player = useVideoPlayer(null, (createdPlayer) => {
    createdPlayer.loop = false;
    createdPlayer.muted = true;
    createdPlayer.timeUpdateEventInterval = 0.1;
  });

  useEffect(() => {
    speedRef.current = speed;
    player.playbackRate = speed;
  }, [player, speed]);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const segmentEnd = segmentEndRef.current;
    if (segmentEnd == null || currentTime < segmentEnd) return;
    player.pause();
    player.currentTime = segmentEnd;
    segmentEndRef.current = null;
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    setBetaPlaying(isPlaying);
  });

  useEffect(() => {
    let active = true;
    segmentEndRef.current = null;
    player.pause();
    player.muted = true;
    player.playbackRate = speedRef.current;
    if (!currentVideo) {
      void player.replaceAsync(null);
      return () => {
        active = false;
      };
    }
    void player.replaceAsync({ uri: analysisVideoUrl(currentVideo.id), useCaching: false }).then(() => {
      if (!active) return;
      if (currentAttempt) {
        player.currentTime = currentAttempt.playbackStartS;
        segmentEndRef.current = currentAttempt.playbackEndS;
      }
      player.play();
    });
    return () => {
      active = false;
      segmentEndRef.current = null;
      player.pause();
    };
  }, [currentAttempt, currentVideo, player]);

  const selectClimb = useCallback((climb: Climb) => {
    segmentEndRef.current = null;
    setSelectedClimb(climb);
    setMoveKey('all');
    setVideoId('');
    setChooserOpen(false);
    setBetaFullscreen(false);
    setComparisonOpen(false);
    setRecordingIndex(0);
    setSearch('');
    setDebouncedSearch('');
  }, []);

  const selectMove = useCallback((nextMoveKey: string) => {
    segmentEndRef.current = null;
    setMoveKey(nextMoveKey);
    setVideoId('');
  }, []);

  const navigateAttempt = useCallback(
    (offset: number) => {
      const next = navigationItems[currentIndex + offset];
      if (next) setVideoId(next.video.id);
    },
    [currentIndex, navigationItems],
  );

  const handleBetaSwipe = useCallback(
    (translationX: number, velocityX: number) => {
      const offset = attemptSwipeOffset(translationX, velocityX);
      if (offset !== 0) navigateAttempt(offset);
    },
    [navigateAttempt],
  );

  const betaSwipeGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([-24, 24])
      .failOffsetY([-20, 20])
      .onStart(() => {
        runOnJS(hideBetaControls)();
      })
      .onEnd((event) => {
        runOnJS(handleBetaSwipe)(event.translationX, event.velocityX);
      });
    const tap = Gesture.Tap().onEnd(() => {
      runOnJS(showBetaControls)();
    });
    return Gesture.Race(pan, tap);
  }, [handleBetaSwipe, hideBetaControls, showBetaControls]);

  const toggleBetaPlayback = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
    showBetaControls();
  }, [player, showBetaControls]);

  const updateSpeed = useCallback(
    (nextSpeed: (typeof SPEEDS)[number]) => {
      speedRef.current = nextSpeed;
      setSpeed(nextSpeed);
      player.playbackRate = nextSpeed;
    },
    [player],
  );

  if (climbsQuery.isLoading) {
    return (
      <View style={styles.centered} accessibilityLabel={t('analysisNavigation.loadingClimbs')}>
        <ActivityIndicator />
      </View>
    );
  }

  if (climbsQuery.isError) {
    return (
      <View style={styles.centered}>
        <Text variant="headline">{t('analysisNavigation.catalogUnavailable')}</Text>
        <Pressable
          onPress={() => void climbsQuery.refetch()}
          accessibilityRole="button"
          style={[styles.retryButton, { backgroundColor: brandColors.primary }]}
        >
          <Text variant="subheadline" color={systemColors.background}>
            {t('analysisNavigation.retry')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const loadingClimb = availabilityQuery.isLoading || navigationQuery.isLoading;
  const attemptCount = navigationItems.length;
  const attemptPosition = currentIndex >= 0 ? currentIndex + 1 : 0;
  const selectedRecording = privateVideos[recordingIndex] ?? null;
  const stackMovePaneForComparison = wideLayout && comparisonOpen && !landscapeLayout && width < 1000;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: systemColors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: bottomChrome.scrollBottomPadding + spacing[6] }]}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('analysisNavigation.chooseClimb')}
        onPress={() => setChooserOpen((open) => !open)}
        style={[
          styles.selector,
          { borderColor: systemColors.separator, backgroundColor: systemColors.secondaryBackground },
        ]}
      >
        <View style={styles.selectorText}>
          <Text variant="headline" numberOfLines={1}>
            {selectedClimb?.name ?? t('analysisNavigation.chooseClimb')}
          </Text>
          {selectedClimb ? (
            <Text variant="caption1" color={systemColors.secondaryLabel} numberOfLines={1}>
              {t('analysisNavigation.catalogClimbMeta', {
                grade: selectedClimb.difficulty,
                angle: selectedClimb.angle,
                setter: selectedClimb.setter_username,
              })}
            </Text>
          ) : null}
        </View>
        <Icon name={chooserOpen ? 'chevron.up' : 'chevron.down'} size={20} color={systemColors.secondaryLabel} />
      </Pressable>

      {chooserOpen ? (
        <View style={[styles.chooser, { borderColor: systemColors.separator }]}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('analysisNavigation.searchPlaceholder')}
            placeholderTextColor={systemColors.tertiaryLabel}
            accessibilityLabel={t('analysisNavigation.searchPlaceholder')}
            style={[
              styles.search,
              {
                borderColor: systemColors.separator,
                color: systemColors.label,
                backgroundColor: systemColors.secondaryBackground,
              },
            ]}
          />
          <ScrollView nestedScrollEnabled style={styles.climbList}>
            {climbs.map((climb) => (
              <Pressable
                key={climb.uuid}
                onPress={() => selectClimb(climb)}
                accessibilityRole="button"
                accessibilityState={{ selected: climb.uuid === selectedClimb?.uuid }}
                style={[
                  styles.climbRow,
                  { borderColor: systemColors.separator },
                  climb.uuid === selectedClimb?.uuid && { backgroundColor: systemColors.fill },
                ]}
              >
                <View style={styles.climbRowText}>
                  <View style={styles.climbTitleRow}>
                    <Text variant="subheadline" numberOfLines={1} style={styles.climbTitle}>
                      {climb.name}
                    </Text>
                    {analyzedClimbIdSet.has(climb.uuid) ? (
                      <Text variant="caption2" color={brandColors.primary}>
                        {t('analysisNavigation.analysisAvailable')}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="caption1" color={systemColors.secondaryLabel} numberOfLines={1}>
                    {t('analysisNavigation.catalogClimbMeta', {
                      grade: climb.difficulty,
                      angle: climb.angle,
                      setter: climb.setter_username,
                    })}
                  </Text>
                </View>
              </Pressable>
            ))}
            {climbsQuery.hasNextPage ? (
              <Pressable
                onPress={() => void climbsQuery.fetchNextPage()}
                disabled={climbsQuery.isFetchingNextPage}
                accessibilityRole="button"
                style={styles.loadMoreButton}
              >
                {climbsQuery.isFetchingNextPage ? (
                  <ActivityIndicator />
                ) : (
                  <Text>{t('analysisNavigation.loadMore')}</Text>
                )}
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {availabilityQuery.isError ? (
        <View style={[styles.statusPanel, { borderColor: systemColors.separator }]}>
          <Text variant="headline">{t('analysisNavigation.deviceUnavailable')}</Text>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('analysisNavigation.deviceUnavailableBody')}
          </Text>
          <Pressable
            onPress={() => void availabilityQuery.refetch()}
            accessibilityRole="button"
            style={styles.statusAction}
          >
            <Text color={brandColors.primary}>{t('analysisNavigation.retry')}</Text>
          </Pressable>
        </View>
      ) : loadingClimb ? (
        <View style={styles.climbLoading} accessibilityLabel={t('analysisNavigation.loadingClimb')}>
          <ActivityIndicator />
        </View>
      ) : videos.length === 0 ? (
        <View style={[styles.statusPanel, { borderColor: systemColors.separator }]}>
          <Text variant="headline">{t('analysisNavigation.noConfirmedVideos')}</Text>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {availability?.candidateVideoCount
              ? t('analysisNavigation.possibleVideos', { count: availability.candidateVideoCount })
              : t('analysisNavigation.noVideosBody')}
          </Text>
        </View>
      ) : (
        <View style={[styles.workspace, wideLayout && !stackMovePaneForComparison && styles.workspaceWide]}>
          <View style={[styles.mediaGroup, wideLayout && comparisonOpen && styles.mediaGroupCompare]}>
            <View style={styles.videoColumn}>
              <View style={[styles.attemptBar, { borderColor: systemColors.separator }]}>
                <Pressable
                  onPress={() => navigateAttempt(-1)}
                  disabled={currentIndex <= 0}
                  accessibilityRole="button"
                  accessibilityLabel={t('analysisNavigation.previousAttempt')}
                  style={[styles.arrowButton, currentIndex <= 0 && styles.disabled]}
                >
                  <Icon name="chevron.left" color={brandColors.primary} />
                </Pressable>
                <Text variant="subheadline">
                  {t(moveKey === 'all' ? 'analysisNavigation.videoPosition' : 'analysisNavigation.attemptPosition', {
                    current: attemptPosition,
                    count: attemptCount,
                  })}
                </Text>
                <Pressable
                  onPress={() => navigateAttempt(1)}
                  disabled={currentIndex < 0 || currentIndex >= attemptCount - 1}
                  accessibilityRole="button"
                  accessibilityLabel={t('analysisNavigation.nextAttempt')}
                  style={[
                    styles.arrowButton,
                    (currentIndex < 0 || currentIndex >= attemptCount - 1) && styles.disabled,
                  ]}
                >
                  <Icon name="chevron.right" color={brandColors.primary} />
                </Pressable>
              </View>

              {currentVideo ? (
                <>
                  {betaFullscreen ? (
                    <View style={styles.video} />
                  ) : (
                    <GestureDetector gesture={betaSwipeGesture}>
                      <View style={styles.videoStage}>
                        <VideoView
                          player={player}
                          style={styles.video}
                          contentFit="contain"
                          nativeControls={false}
                          fullscreenOptions={{ enable: false }}
                          surfaceType="textureView"
                          accessibilityLabel={t('analysisNavigation.videoAria')}
                        />
                        {betaControlsVisible ? (
                          <Pressable
                            onPress={toggleBetaPlayback}
                            accessibilityRole="button"
                            accessibilityLabel={tCommon(betaPlaying ? 'playback.pause' : 'playback.play')}
                            style={styles.playbackButton}
                          >
                            <Icon name={betaPlaying ? 'pause' : 'play.fill'} size={32} color="#ffffff" />
                          </Pressable>
                        ) : null}
                        <Pressable
                          onPress={() => setBetaFullscreen(true)}
                          accessibilityRole="button"
                          accessibilityLabel={t('analysisNavigation.enterFullscreen')}
                          style={styles.fullscreenButton}
                        >
                          <Icon name="fullscreen" color="#ffffff" />
                        </Pressable>
                      </View>
                    </GestureDetector>
                  )}
                  <Modal
                    visible={betaFullscreen}
                    animationType="fade"
                    presentationStyle="fullScreen"
                    supportedOrientations={[
                      'portrait',
                      'portrait-upside-down',
                      'landscape',
                      'landscape-left',
                      'landscape-right',
                    ]}
                    onRequestClose={() => setBetaFullscreen(false)}
                  >
                    <GestureHandlerRootView style={styles.fullscreenRoot}>
                      <StatusBar hidden />
                      <GestureDetector gesture={betaSwipeGesture}>
                        <View style={styles.fullscreenStage}>
                          <VideoView
                            player={player}
                            style={styles.fullscreenVideo}
                            contentFit="contain"
                            nativeControls={false}
                            fullscreenOptions={{ enable: false }}
                            surfaceType="textureView"
                            accessibilityLabel={t('analysisNavigation.videoAria')}
                          />
                          {betaControlsVisible ? (
                            <Pressable
                              onPress={toggleBetaPlayback}
                              accessibilityRole="button"
                              accessibilityLabel={tCommon(betaPlaying ? 'playback.pause' : 'playback.play')}
                              style={styles.playbackButton}
                            >
                              <Icon name={betaPlaying ? 'pause' : 'play.fill'} size={32} color="#ffffff" />
                            </Pressable>
                          ) : null}
                          <Pressable
                            onPress={() => setBetaFullscreen(false)}
                            accessibilityRole="button"
                            accessibilityLabel={t('analysisNavigation.exitFullscreen')}
                            style={[styles.fullscreenButton, styles.fullscreenExitButton]}
                          >
                            <Icon name="fullscreen.exit" color="#ffffff" />
                          </Pressable>
                        </View>
                      </GestureDetector>
                    </GestureHandlerRootView>
                  </Modal>
                </>
              ) : (
                <View style={[styles.video, styles.videoEmpty, { backgroundColor: systemColors.fill }]}>
                  <Text variant="subheadline" color={systemColors.secondaryLabel}>
                    {t('analysisNavigation.noAttempts')}
                  </Text>
                </View>
              )}

              <View style={styles.videoMeta}>
                <View style={styles.sourceMeta}>
                  <Text variant="subheadline">
                    {currentVideo?.sourceAccount
                      ? `@${currentVideo.sourceAccount}`
                      : t('analysisNavigation.unknownSource')}
                  </Text>
                  {currentAttempt ? (
                    <>
                      <Text variant="caption1" color={systemColors.secondaryLabel}>
                        {transitionLabel(currentAttempt)}
                      </Text>
                      <Text variant="caption1" color={systemColors.secondaryLabel}>
                        {t('analysisNavigation.confidence', {
                          move: currentAttempt.localOrdinal,
                          confidence: Math.round(currentAttempt.confidence * 100),
                        })}
                      </Text>
                      {currentAttempt.warnings.length > 0 ? (
                        <Text variant="caption1" color={systemColors.secondaryLabel} numberOfLines={2}>
                          {currentAttempt.warnings.join(' · ').replaceAll('_', ' ')}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </View>
                <View
                  accessibilityRole="radiogroup"
                  style={[styles.speedControl, { backgroundColor: systemColors.fill }]}
                >
                  {SPEEDS.map((candidate) => (
                    <Pressable
                      key={candidate}
                      onPress={() => updateSpeed(candidate)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: speed === candidate }}
                      accessibilityLabel={`${candidate}x`}
                      style={[
                        styles.speedButton,
                        speed === candidate && { backgroundColor: systemColors.elevatedSurface },
                      ]}
                    >
                      <Text
                        variant="caption1"
                        color={speed === candidate ? brandColors.primary : systemColors.secondaryLabel}
                      >
                        {candidate}x
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {privateVideos.length > 0 && !comparisonOpen ? (
                  <Pressable
                    onPress={() => setComparisonOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('analysisNavigation.compareRecording')}
                    style={[styles.compareButton, { borderColor: systemColors.separator }]}
                  >
                    <Icon name="video" size={18} color={brandColors.primary} />
                    <Text variant="caption1" color={brandColors.primary}>
                      {t('analysisNavigation.yourRecordings', { count: privateVideos.length })}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {comparisonOpen && selectedRecording ? (
              <PrivateAttemptComparison
                video={selectedRecording}
                index={recordingIndex}
                count={privateVideos.length}
                speed={speed}
                onPrevious={() => setRecordingIndex((current) => Math.max(0, current - 1))}
                onNext={() => setRecordingIndex((current) => Math.min(privateVideos.length - 1, current + 1))}
                onClose={() => setComparisonOpen(false)}
              />
            ) : null}
          </View>

          <View
            style={[
              styles.movePane,
              wideLayout && !stackMovePaneForComparison ? styles.movePaneWide : styles.movePaneStacked,
              { borderColor: systemColors.separator },
            ]}
          >
            <View style={[styles.moveHeader, { borderColor: systemColors.separator }]}>
              <Text variant="headline">{t('analysisNavigation.moves')}</Text>
              <Text variant="caption1" color={systemColors.secondaryLabel}>
                {String(navigation?.moves.length ?? 0)}
              </Text>
            </View>
            <ScrollView nestedScrollEnabled style={styles.moveList}>
              <Pressable
                onPress={() => selectMove('all')}
                accessibilityRole="button"
                accessibilityState={{ selected: moveKey === 'all' }}
                style={[
                  styles.moveRow,
                  { borderColor: systemColors.separator },
                  moveKey === 'all' && { backgroundColor: systemColors.fill },
                ]}
              >
                <Text variant="subheadline">{t('analysisNavigation.allMoves')}</Text>
                <Text variant="caption1" color={systemColors.secondaryLabel}>
                  {t('analysisNavigation.videoCount', { count: videos.length })}
                </Text>
              </Pressable>
              {navigation?.moves.map((move) => (
                <Pressable
                  key={move.moveKey}
                  onPress={() => selectMove(move.moveKey)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: moveKey === move.moveKey }}
                  style={[
                    styles.moveRow,
                    { borderColor: systemColors.separator },
                    moveKey === move.moveKey && { backgroundColor: systemColors.fill },
                  ]}
                >
                  <Text variant="subheadline" color={moveKey === move.moveKey ? brandColors.primary : undefined}>
                    {targetLabel(move)}
                  </Text>
                  <Text variant="caption1" color={systemColors.secondaryLabel}>
                    {t('analysisNavigation.coverage', { videos: move.videoCount, total: videos.length })}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing[3], padding: spacing[4] },
  centered: { flex: 1, gap: spacing[4], alignItems: 'center', justifyContent: 'center', padding: spacing[6] },
  retryButton: { minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  selector: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  selectorText: { flex: 1, gap: 2 },
  chooser: {
    gap: spacing[3],
    height: 420,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
  },
  search: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: spacing[3],
    fontSize: 16,
  },
  climbList: { flex: 1 },
  climbRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  climbRowText: { flex: 1, gap: 2 },
  climbTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  climbTitle: { flex: 1 },
  loadMoreButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  climbLoading: { minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  statusPanel: {
    minHeight: 150,
    gap: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.lg,
    padding: spacing[5],
  },
  statusAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing[4] },
  workspace: { gap: spacing[3] },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mediaGroup: { flex: 1, minWidth: 0, gap: spacing[3] },
  mediaGroupCompare: { flexDirection: 'row', alignItems: 'flex-start' },
  videoColumn: { flex: 1, minWidth: 0, gap: spacing[2] },
  attemptBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  arrowButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  videoStage: { width: '100%', position: 'relative' },
  video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 620, backgroundColor: '#000000' },
  videoEmpty: { alignItems: 'center', justifyContent: 'center' },
  fullscreenRoot: { flex: 1, backgroundColor: '#000000' },
  fullscreenStage: { flex: 1, position: 'relative', backgroundColor: '#000000' },
  fullscreenVideo: { flex: 1, backgroundColor: '#000000' },
  playbackButton: {
    width: 64,
    height: 64,
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 2,
    marginTop: -32,
    marginLeft: -32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  fullscreenButton: {
    width: 44,
    height: 44,
    position: 'absolute',
    top: spacing[3],
    right: spacing[3],
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  fullscreenExitButton: { top: spacing[4], right: spacing[4] },
  videoMeta: {
    minHeight: 60,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  sourceMeta: { flex: 1, gap: 2 },
  speedControl: { flexDirection: 'row', padding: 3, borderRadius: 8 },
  speedButton: { minWidth: 48, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  compareButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: spacing[3],
  },
  movePane: {
    minWidth: 0,
    maxHeight: 620,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  movePaneWide: { width: 230, flexGrow: 0, flexShrink: 0 },
  movePaneStacked: { width: '100%', maxHeight: 360 },
  moveHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
  },
  moveList: { flexGrow: 0 },
  moveRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
});
