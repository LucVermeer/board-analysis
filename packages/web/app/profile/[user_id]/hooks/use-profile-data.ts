'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { isAbortError } from '@/app/lib/is-abort-error';
import {
  filterLogbookByTimeframe,
  buildAggregatedStackedBars,
  buildWeeklyBars,
  buildAggregatedFlashRedpointBars,
  buildStatisticsSummary,
  buildVPointsTimeline,
} from '../utils/chart-data-builders';

type InitialData = {
  initialProfile?: UserProfile;
  initialProfileStats?: GetUserProfileStatsQueryResponse['userProfileStats'];
  initialPercentile?: GetUserClimbPercentileQueryResponse['userClimbPercentile'] | null;
  initialAllBoardsTicks?: Record<string, LogbookEntry[]>;
  initialLogbook?: LogbookEntry[];
  initialIsOwnProfile?: boolean;
  initialNotFound?: boolean;
};

type BoardTicks = Record<string, LogbookEntry[]>;

// 404 from the profile endpoint is meaningful: the user wants the "not found"
// page. Tag it so the query consumer can branch on it without parsing strings.
class ProfileNotFoundError extends Error {
  readonly code = 'PROFILE_NOT_FOUND';
  constructor() {
    super('Profile not found');
  }
}

const PROFILE_STALE_TIME_MS = 5 * 60 * 1000;
const PROFILE_GC_TIME_MS = 24 * 60 * 60 * 1000;

export function useProfileData(userId: string, initialData?: InitialData) {
  const { data: session } = useSession();
  const { showMessage } = useSnackbar();
  const { gradeFormat } = useGradeFormat();
  const queryClient = useQueryClient();
  const isRestoring = useIsRestoring();

  const [selectedBoard, setSelectedBoard] = useState<string>('all');
  const [unifiedTimeframe, setUnifiedTimeframe] = useState<UnifiedTimeframeType>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const isOwnProfile = session?.user?.id ? session.user.id === userId : (initialData?.initialIsOwnProfile ?? false);

  const profileInitial = initialData?.initialProfile;
  const profileQuery = useQuery<UserProfile>({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const response = await fetch(`/api/internal/profile/${userId}`);
      if (response.status === 404) throw new ProfileNotFoundError();
      if (!response.ok) throw new Error('Failed to fetch profile');
      const body = await response.json();
      return {
        id: body.id,
        email: body.email,
        name: body.name,
        image: body.image,
        profile: body.profile,
        credentials: body.credentials,
        followerCount: body.followerCount ?? 0,
        followingCount: body.followingCount ?? 0,
        isFollowedByMe: body.isFollowedByMe ?? false,
      } satisfies UserProfile;
    },
    enabled: !initialData?.initialNotFound,
    staleTime: PROFILE_STALE_TIME_MS,
    gcTime: PROFILE_GC_TIME_MS,
    refetchOnMount: 'always',
    retry: (failureCount, error) => !(error instanceof ProfileNotFoundError) && failureCount < 3,
    initialData: profileInitial,
    initialDataUpdatedAt: profileInitial ? Date.now() : undefined,
    meta: { persist: true },
  });

  const profileError = profileQuery.error;
  const notFound = (initialData?.initialNotFound ?? false) || profileError instanceof ProfileNotFoundError;

  useEffect(() => {
    if (!profileError) return;
    if (profileError instanceof ProfileNotFoundError) return;
    if (isAbortError(profileError)) return;
    console.error('Failed to fetch profile:', profileError);
    showMessage('Failed to load profile data', 'error');
  }, [profileError, showMessage]);

  const ticksInitial = initialData?.initialAllBoardsTicks;
  const ticksQuery = useQuery<BoardTicks>({
    queryKey: ['userTicks', userId],
    queryFn: async () => {
      const client = createGraphQLHttpClient(null);
      const collected: BoardTicks = {};
      await Promise.all(
        BOARD_TYPES.map(async (boardType) => {
          const variables: GetUserTicksQueryVariables = { userId, boardType };
          const response = await client.request<GetUserTicksQueryResponse>(GET_USER_TICKS, variables);
          collected[boardType] = response.userTicks.map((tick) => ({
            climbed_at: tick.climbedAt,
            difficulty: tick.difficulty,
            effectiveDifficulty: tick.effectiveDifficulty ?? null,
            tries: tick.attemptCount,
            angle: tick.angle,
            status: tick.status,
            layoutId: tick.layoutId,
            boardType,
            climbUuid: tick.climbUuid,
          }));
        }),
      );
      return collected;
    },
    staleTime: PROFILE_STALE_TIME_MS,
    gcTime: PROFILE_GC_TIME_MS,
    refetchOnMount: 'always',
    initialData: ticksInitial,
    initialDataUpdatedAt: ticksInitial ? Date.now() : undefined,
    meta: { persist: true },
  });

  const profileStatsInitial = initialData?.initialProfileStats;
  const profileStatsQuery = useQuery<GetUserProfileStatsQueryResponse['userProfileStats']>({
    queryKey: ['userProfileStats', userId],
    queryFn: async () => {
      const client = createGraphQLHttpClient(null);
      const variables: GetUserProfileStatsQueryVariables = { userId };
      const response = await client.request<GetUserProfileStatsQueryResponse>(GET_USER_PROFILE_STATS, variables);
      return response.userProfileStats;
    },
    staleTime: PROFILE_STALE_TIME_MS,
    gcTime: PROFILE_GC_TIME_MS,
    refetchOnMount: 'always',
    initialData: profileStatsInitial,
    initialDataUpdatedAt: profileStatsInitial ? Date.now() : undefined,
    meta: { persist: true },
  });

  const percentileInitial = initialData?.initialPercentile ?? undefined;
  const percentileQuery = useQuery<GetUserClimbPercentileQueryResponse['userClimbPercentile']>({
    queryKey: ['userClimbPercentile', userId],
    queryFn: async () => {
      const client = createGraphQLHttpClient(null);
      const response = await client.request<GetUserClimbPercentileQueryResponse>(GET_USER_CLIMB_PERCENTILE, {
        userId,
      });
      return response.userClimbPercentile;
    },
    staleTime: PROFILE_STALE_TIME_MS,
    gcTime: PROFILE_GC_TIME_MS,
    refetchOnMount: 'always',
    initialData: percentileInitial,
    initialDataUpdatedAt: percentileInitial !== undefined ? Date.now() : undefined,
    meta: { persist: true },
  });

  const profile = profileQuery.data ?? null;
  const profileStats = profileStatsQuery.data ?? null;
  const percentile = percentileQuery.data ?? null;
  const allBoardsTicks = useMemo<BoardTicks>(() => ticksQuery.data ?? {}, [ticksQuery.data]);

  const setProfile = useCallback(
    (next: UserProfile) => {
      queryClient.setQueryData<UserProfile>(['profile', userId], next);
    },
    [queryClient, userId],
  );

  // `loading` is the first-paint gate. Treat hydration-from-IDB as "still
  // loading" so the skeleton hides until either persisted or fresh data is
  // available — otherwise hard reloads show an empty state for one frame.
  const loading = !notFound && (isRestoring || (profileQuery.isPending && !profile));
  const loadingAggregated = !notFound && (isRestoring || (ticksQuery.isPending && !ticksQuery.data));
  const loadingProfileStats = !notFound && (isRestoring || (profileStatsQuery.isPending && !profileStats));

  // Filter allBoardsTicks by selected board
  const filteredBoardsTicks = useMemo<BoardTicks>(() => {
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
      // Prefer the server-coalesced consensus value; fall back to the raw
      // override when absent (test fixtures, transient optimistic writes).
      const grade = tick.effectiveDifficulty ?? tick.difficulty;
      if (grade == null) continue;
      if (tick.status === 'send' || tick.status === 'flash') {
        if (grade > maxSendDifficulty) maxSendDifficulty = grade;
      }
      if (tick.status === 'flash') {
        if (grade > maxFlashDifficulty) maxFlashDifficulty = grade;
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
