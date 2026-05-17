// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vite-plus/test';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import { useGradeFormat } from '@/app/hooks/use-grade-format';
import { GET_USER_CLIMB_PERCENTILE, GET_USER_PROFILE_STATS, GET_USER_TICKS } from '@/app/lib/graphql/operations';
import { useProfileData } from '../use-profile-data';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: vi.fn(),
}));

vi.mock('@/app/hooks/use-grade-format', () => ({
  useGradeFormat: vi.fn(),
}));

const mockRequest = vi.fn();
vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: mockRequest }),
}));

const mockUseSession = vi.mocked(useSession);
const mockUseSnackbar = vi.mocked(useSnackbar);
const mockUseGradeFormat = vi.mocked(useGradeFormat);

function renderProfileDataHook<T>(callback: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(callback, { wrapper });
}

describe('useProfileData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: 'user-1' }, expires: '' },
      update: vi.fn(),
    });
    mockUseSnackbar.mockReturnValue({ showMessage: vi.fn() });
    mockUseGradeFormat.mockReturnValue({
      gradeFormat: 'v-grade',
      loaded: true,
      setGradeFormat: vi.fn(async () => {}),
      formatGrade: vi.fn((difficulty: string | null | undefined) => difficulty ?? null),
      getGradeColor: vi.fn(() => undefined),
    });
    mockRequest.mockResolvedValue({ userClimbPercentile: null });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response),
    );
  });

  it('adds explicit send and flash status metadata to hardest grade highlights', () => {
    const { result } = renderProfileDataHook(() =>
      useProfileData('user-1', {
        initialProfile: {
          id: 'user-1',
          email: undefined,
          name: 'Test User',
          image: null,
          profile: null,
          credentials: [],
          followerCount: 0,
          followingCount: 0,
          isFollowedByMe: false,
        },
        initialProfileStats: {
          totalDistinctClimbs: 3,
          layoutStats: [],
        },
        initialPercentile: {
          totalDistinctClimbs: 3,
          percentile: 75,
          totalActiveUsers: 20,
        },
        initialAllBoardsTicks: {
          kilter: [
            {
              climbed_at: '2025-01-01T12:00:00Z',
              difficulty: 22,
              tries: 3,
              angle: 40,
              status: 'send',
              layoutId: 1,
              boardType: 'kilter',
              climbUuid: 'send-climb',
            },
            {
              climbed_at: '2025-01-02T12:00:00Z',
              difficulty: 20,
              tries: 1,
              angle: 40,
              status: 'flash',
              layoutId: 1,
              boardType: 'kilter',
              climbUuid: 'flash-climb',
            },
            {
              climbed_at: '2025-01-03T12:00:00Z',
              difficulty: 24,
              tries: 2,
              angle: 40,
              status: 'attempt',
              layoutId: 1,
              boardType: 'kilter',
              climbUuid: 'attempt-climb',
            },
          ],
        },
        initialLogbook: [],
        initialIsOwnProfile: true,
      }),
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.hardestSend).toMatchObject({ label: 'V6', status: 'send' });
    expect(result.current.hardestFlash).toMatchObject({ label: 'V5', status: 'flash' });
    expect(result.current.percentile).toMatchObject({ percentile: 75, totalActiveUsers: 20 });
  });

  it('fetches missing profile, ticks, stats, and percentile data on mount', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Fetched User',
        image: null,
        profile: null,
        credentials: [],
        followerCount: 4,
        followingCount: 2,
        isFollowedByMe: false,
      }),
    } as Response);

    mockRequest.mockImplementation(async (query: unknown, variables?: Record<string, unknown>) => {
      if (query === GET_USER_TICKS && variables?.boardType === 'kilter') {
        return {
          userTicks: [
            {
              climbedAt: '2025-01-01T12:00:00Z',
              difficulty: 22,
              attemptCount: 2,
              angle: 40,
              status: 'send',
              layoutId: 1,
              climbUuid: 'fetched-send',
            },
          ],
        };
      }
      if (query === GET_USER_TICKS) {
        return { userTicks: [] };
      }
      if (query === GET_USER_PROFILE_STATS) {
        return {
          userProfileStats: {
            totalDistinctClimbs: 1,
            layoutStats: [],
          },
        };
      }
      if (query === GET_USER_CLIMB_PERCENTILE) {
        return {
          userClimbPercentile: {
            totalDistinctClimbs: 1,
            percentile: 90,
            totalActiveUsers: 10,
          },
        };
      }
      return {};
    });

    const { result } = renderProfileDataHook(() => useProfileData('user-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.loadingAggregated).toBe(false);
      expect(result.current.loadingProfileStats).toBe(false);
    });

    expect(fetch).toHaveBeenCalledWith('/api/internal/profile/user-1');
    expect(result.current.profile?.name).toBe('Fetched User');
    expect(result.current.statisticsSummary.totalAscents).toBe(1);
    expect(result.current.hardestSend).toMatchObject({ label: 'V6', status: 'send' });
    expect(result.current.percentile).toMatchObject({ percentile: 90, totalActiveUsers: 10 });
  });

  it('recomputes hardest grades when filtering to a single board', async () => {
    const { result } = renderProfileDataHook(() =>
      useProfileData('user-1', {
        initialProfile: {
          id: 'user-1',
          email: undefined,
          name: 'Test User',
          image: null,
          profile: null,
          credentials: [],
          followerCount: 0,
          followingCount: 0,
          isFollowedByMe: false,
        },
        initialProfileStats: {
          totalDistinctClimbs: 4,
          layoutStats: [],
        },
        initialPercentile: {
          totalDistinctClimbs: 4,
          percentile: 80,
          totalActiveUsers: 20,
        },
        initialAllBoardsTicks: {
          kilter: [
            {
              climbed_at: '2025-01-01T12:00:00Z',
              difficulty: 22,
              tries: 3,
              angle: 40,
              status: 'send',
              layoutId: 1,
              boardType: 'kilter',
              climbUuid: 'kilter-send',
            },
          ],
          tension: [
            {
              climbed_at: '2025-01-02T12:00:00Z',
              difficulty: 24,
              tries: 1,
              angle: 40,
              status: 'flash',
              layoutId: 9,
              boardType: 'tension',
              climbUuid: 'tension-flash',
            },
          ],
        },
        initialLogbook: [],
        initialIsOwnProfile: true,
      }),
    );

    expect(result.current.hardestSend).toMatchObject({ label: 'V8', status: 'send' });
    expect(result.current.hardestFlash).toMatchObject({ label: 'V8', status: 'flash' });

    act(() => {
      result.current.setSelectedBoard('kilter');
    });

    expect(result.current.hardestSend).toMatchObject({ label: 'V6', status: 'send' });
    expect(result.current.hardestFlash).toBeNull();
  });

  it('seeds percentile from initial data without waiting on a fetch', () => {
    const initialPercentile = {
      totalDistinctClimbs: 12,
      percentile: 90,
      totalActiveUsers: 40,
    };

    const { result } = renderProfileDataHook(() =>
      useProfileData('user-1', {
        initialProfile: {
          id: 'user-1',
          email: undefined,
          name: 'Test User',
          image: null,
          profile: null,
          credentials: [],
          followerCount: 0,
          followingCount: 0,
          isFollowedByMe: false,
        },
        initialProfileStats: {
          totalDistinctClimbs: 12,
          layoutStats: [],
        },
        initialPercentile,
        initialAllBoardsTicks: {
          kilter: [],
        },
        initialLogbook: [],
        initialIsOwnProfile: true,
      }),
    );

    expect(result.current.percentile).toEqual(initialPercentile);
  });
});
