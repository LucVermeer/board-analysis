'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import {
  GET_USER_TICKS,
  type GetUserTicksQueryVariables,
  type GetUserTicksQueryResponse,
  GET_USER_PROFILE_STATS,
  type GetUserProfileStatsQueryVariables,
  type GetUserProfileStatsQueryResponse,
  GET_USER_CLIMB_PERCENTILE,
  type GetUserClimbPercentileQueryResponse,
} from '@/app/lib/graphql/operations';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import { useGradeFormat } from '@/app/hooks/use-grade-format';
import {
  type UserProfile,
  type LogbookEntry,
  type UnifiedTimeframeType,
  BOARD_TYPES,
  getDifficultyMapping,
} from '../utils/profile-constants';
import { getGradeColor, getGradeTextColor } from '@/app/lib/grade-colors';
import {
  filterLogbookByTimeframe,
  buildAggregatedStackedBars,
  buildWeeklyBars,
  buildAggregatedFlashRedpointBars,
  buildStatisticsSummary,
  buildVPointsTimeline,
} from '../utils/chart-data-builders';

/**
 * Recognise the "request was aborted" exit path so callers can swallow it
 * silently. Page navigation in modern browsers aborts in-flight fetches; the
 * resulting rejection is not a real error and shouldn't surface as a snackbar
 * or unhandled rejection (see Sentry BOARDSESH-1F).
 */
function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return true;
  // graphql-request wraps the underlying fetch failure; the original DOMException
  // surfaces on `.cause` in modern runtimes.
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error && cause.name === 'AbortError') return true;
  return false;
}

type InitialData = {
  initialProfile?: UserProfile;
  initialProfileStats?: GetUserProfileStatsQueryResponse['userProfileStats'];
  initialPercentile?: GetUserClimbPercentileQueryResponse['userClimbPercentile'] | null;
  initialAllBoardsTicks?: Record<string, LogbookEntry[]>;
  initialLogbook?: LogbookEntry[];
  initialIsOwnProfile?: boolean;
  initialNotFound?: boolean;
};

export function useProfileData(userId: string, initialData?: InitialData) {
  const { data: session } = useSession();
  const { showMessage } = useSnackbar();
  const { gradeFormat } = useGradeFormat();

  const [loading, setLoading] = useState(!initialData?.initialProfile && !initialData?.initialNotFound);
  const [notFound, setNotFound] = useState(initialData?.initialNotFound ?? false);
  const [profile, setProfile] = useState<UserProfile | null>(initialData?.initialProfile ?? null);
  const [selectedBoard, setSelectedBoard] = useState<string>('all');
  const [unifiedTimeframe, setUnifiedTimeframe] = useState<UnifiedTimeframeType>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [allBoardsTicks, setAllBoardsTicks] = useState<Record<string, LogbookEntry[]>>(
    initialData?.initialAllBoardsTicks ?? {},
  );
  const [loadingAggregated, setLoadingAggregated] = useState(!initialData?.initialAllBoardsTicks);
  const [profileStats, setProfileStats] = useState<GetUserProfileStatsQueryResponse['userProfileStats'] | null>(
    initialData?.initialProfileStats ?? null,
  );
  const [loadingProfileStats, setLoadingProfileStats] = useState(!initialData?.initialProfileStats);
  const [percentile, setPercentile] = useState<{
    totalDistinctClimbs: number;
    percentile: number;
    totalActiveUsers: number;
  } | null>(initialData?.initialPercentile ?? null);

  const isOwnProfile = session?.user?.id ? session.user.id === userId : (initialData?.initialIsOwnProfile ?? false);

  const fetchProfile = useCallback(async () => {
    try {
      const response = await fetch(`/api/internal/profile/${userId}`);
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) throw new Error('Failed to fetch profile');
      const data = await response.json();
      setProfile({
        id: data.id,
        email: data.email,
        name: data.name,
        image: data.image,
        profile: data.profile,
        credentials: data.credentials,
        followerCount: data.followerCount ?? 0,
        followingCount: data.followingCount ?? 0,
        isFollowedByMe: data.isFollowedByMe ?? false,
      });
    } catch (error) {
      // Navigation away from the page aborts the in-flight fetch — that's not
      // a real failure, so don't bother the user with an error toast.
      if (isAbortError(error)) return;
      console.error('Failed to fetch profile:', error);
      showMessage('Failed to load profile data', 'error');
    } finally {
      setLoading(false);
    }
  }, [userId, showMessage]);

  const fetchAllBoardsTicks = useCallback(async () => {
    setLoadingAggregated(true);
    try {
      const client = createGraphQLHttpClient(null);
      const results: Record<string, LogbookEntry[]> = {};
      await Promise.all(
        BOARD_TYPES.map(async (boardType) => {
          const variables: GetUserTicksQueryVariables = { userId, boardType };
          const response = await client.request<GetUserTicksQueryResponse>(GET_USER_TICKS, variables);
          results[boardType] = response.userTicks.map((tick) => ({
            climbed_at: tick.climbedAt,
            difficulty: tick.difficulty,
            tries: tick.attemptCount,
            angle: tick.angle,
            status: tick.status,
            layoutId: tick.layoutId,
            boardType,
            climbUuid: tick.climbUuid,
          }));
        }),
      );
      setAllBoardsTicks(results);
    } catch (error) {
      if (isAbortError(error)) return;
      console.error('Error fetching all boards ticks:', error);
      setAllBoardsTicks({});
    } finally {
      setLoadingAggregated(false);
    }
  }, [userId]);

  const fetchProfileStats = useCallback(async () => {
    setLoadingProfileStats(true);
    try {
      const client = createGraphQLHttpClient(null);
      const variables: GetUserProfileStatsQueryVariables = { userId };
      const response = await client.request<GetUserProfileStatsQueryResponse>(GET_USER_PROFILE_STATS, variables);
      setProfileStats(response.userProfileStats);
    } catch (error) {
      if (isAbortError(error)) return;
      console.error('Error fetching profile stats:', error);
      setProfileStats(null);
    } finally {
      setLoadingProfileStats(false);
    }
  }, [userId]);

  const fetchPercentile = useCallback(async () => {
    try {
      const client = createGraphQLHttpClient(null);
      const response = await client.request<GetUserClimbPercentileQueryResponse>(GET_USER_CLIMB_PERCENTILE, { userId });
      setPercentile(response.userClimbPercentile);
    } catch {
      // Percentile is not critical — silently fail (this also covers AbortError on navigation).
    }
  }, [userId]);

  useEffect(() => {
    if (!initialData?.initialProfile && !initialData?.initialNotFound) void fetchProfile();
  }, [fetchProfile, initialData?.initialProfile, initialData?.initialNotFound]);

  useEffect(() => {
    if (!initialData?.initialAllBoardsTicks) void fetchAllBoardsTicks();
  }, [fetchAllBoardsTicks, initialData?.initialAllBoardsTicks]);

  useEffect(() => {
    if (!initialData?.initialProfileStats) void fetchProfileStats();
  }, [fetchProfileStats, initialData?.initialProfileStats]);

  useEffect(() => {
    if (!initialData?.initialPercentile) void fetchPercentile();
  }, [fetchPercentile, initialData?.initialPercentile]);

  // Filter allBoardsTicks by selected board
  const filteredBoardsTicks = useMemo<Record<string, LogbookEntry[]>>(() => {
    if (selectedBoard === 'all') return allBoardsTicks;
    return { [selectedBoard]: allBoardsTicks[selectedBoard] || [] };
  }, [allBoardsTicks, selectedBoard]);

  // Flat logbook from filtered boards, with timeframe applied
  const filteredLogbook = useMemo(() => {
    const flat = Object.values(filteredBoardsTicks).flat();
    return filterLogbookByTimeframe(flat, unifiedTimeframe, fromDate, toDate);
  }, [filteredBoardsTicks, unifiedTimeframe, fromDate, toDate]);

  const aggregatedStackedBars = useMemo(
    () => buildAggregatedStackedBars(filteredBoardsTicks, unifiedTimeframe, gradeFormat, fromDate, toDate),
    [filteredBoardsTicks, unifiedTimeframe, gradeFormat, fromDate, toDate],
  );

  const weeklyBars = useMemo(
    () => buildWeeklyBars(filteredLogbook, undefined, undefined, gradeFormat),
    [filteredLogbook, gradeFormat],
  );

  const aggregatedFlashRedpointBars = useMemo(
    () => buildAggregatedFlashRedpointBars(filteredBoardsTicks, unifiedTimeframe, gradeFormat, fromDate, toDate),
    [filteredBoardsTicks, unifiedTimeframe, gradeFormat, fromDate, toDate],
  );

  const statisticsSummary = useMemo(
    () => buildStatisticsSummary(profileStats, gradeFormat),
    [profileStats, gradeFormat],
  );

  const vPointsTimeline = useMemo(
    () => buildVPointsTimeline(filteredBoardsTicks, unifiedTimeframe, fromDate, toDate),
    [filteredBoardsTicks, unifiedTimeframe, fromDate, toDate],
  );

  // Compute hardest send and hardest flash from filtered ticks
  const { hardestSend, hardestFlash } = useMemo(() => {
    const allTicks = Object.values(filteredBoardsTicks).flat();
    const mapping = getDifficultyMapping(gradeFormat);
    let maxSendDifficulty = -1;
    let maxFlashDifficulty = -1;

    for (const tick of allTicks) {
      if (tick.difficulty == null) continue;
      if (tick.status === 'send' || tick.status === 'flash') {
        if (tick.difficulty > maxSendDifficulty) maxSendDifficulty = tick.difficulty;
      }
      if (tick.status === 'flash') {
        if (tick.difficulty > maxFlashDifficulty) maxFlashDifficulty = tick.difficulty;
      }
    }

    const makeHighlight = (difficulty: number, status: 'send' | 'flash') => {
      const label = mapping[difficulty] ?? `${difficulty}`;
      const color = getGradeColor(label) ?? 'var(--neutral-200)';
      const textColor = getGradeTextColor(color);
      return { label, color, textColor, status };
    };

    return {
      hardestSend: maxSendDifficulty >= 0 ? makeHighlight(maxSendDifficulty, 'send') : null,
      hardestFlash: maxFlashDifficulty >= 0 ? makeHighlight(maxFlashDifficulty, 'flash') : null,
    };
  }, [filteredBoardsTicks, gradeFormat]);

  return {
    // Profile state
    loading,
    notFound,
    profile,
    setProfile,
    isOwnProfile,

    // Board selection
    selectedBoard,
    setSelectedBoard,

    // Unified filters
    unifiedTimeframe,
    setUnifiedTimeframe,
    fromDate,
    setFromDate,
    toDate,
    setToDate,

    // Board stats
    filteredLogbook,
    weeklyBars,

    // Aggregated stats
    loadingAggregated,
    aggregatedStackedBars,
    aggregatedFlashRedpointBars,

    // Profile stats summary
    loadingProfileStats,
    layoutStats: profileStats?.layoutStats ?? [],
    statisticsSummary,
    hardestSend,
    hardestFlash,

    // V-Points timeline
    vPointsTimeline,

    // Percentile ranking
    percentile,
  };
}
