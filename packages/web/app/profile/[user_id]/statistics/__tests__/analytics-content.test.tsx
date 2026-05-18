import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen } from '@testing-library/react';
import React from 'react';
import AnalyticsContent from '../analytics-content';
import { useProfileData } from '../../hooks/use-profile-data';

vi.mock('../../hooks/use-profile-data', () => ({
  useProfileData: vi.fn(),
}));

vi.mock('../../components/stats-summary', () => ({
  default: (props: { weeklyBars?: unknown[] | null }) => (
    <div data-testid="stats-summary" data-has-weekly-bars={props.weeklyBars ? 'true' : 'false'} />
  ),
}));

vi.mock('../../components/board-stats-section', () => ({
  default: (props: Record<string, unknown>) => (
    <div
      data-testid="board-stats-section"
      data-has-weekly-bars-prop={Object.prototype.hasOwnProperty.call(props, 'weeklyBars') ? 'true' : 'false'}
    />
  ),
}));

const mockUseProfileData = vi.mocked(useProfileData);

function mockProfileDataReturn(overrides?: Partial<ReturnType<typeof useProfileData>>) {
  return {
    loading: false,
    notFound: false,
    profile: null,
    setProfile: vi.fn(),
    isOwnProfile: false,
    selectedBoard: 'all',
    setSelectedBoard: vi.fn(),
    allBoardsTicks: {},
    filteredLogbook: [],
    unifiedTimeframe: 'all' as const,
    setUnifiedTimeframe: vi.fn(),
    fromDate: '',
    setFromDate: vi.fn(),
    toDate: '',
    setToDate: vi.fn(),
    weeklyBars: null,
    aggregatedFlashRedpointBars: null,
    vPointsTimeline: null,
    loadingAggregated: false,
    aggregatedStackedBars: null,
    loadingProfileStats: false,
    layoutStats: [],
    statisticsSummary: { totalAscents: 0, layoutPercentages: [] },
    hardestSend: null,
    hardestFlash: null,
    percentile: null,
    ...overrides,
  };
}

describe('AnalyticsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProfileData.mockReturnValue(mockProfileDataReturn());
  });

  it('renders the statistics summary and fallback section', () => {
    render(<AnalyticsContent userId="user-2" />);

    expect(screen.getByTestId('stats-summary')).toBeTruthy();
    expect(screen.getByTestId('board-stats-section')).toBeTruthy();
  });

  it('passes weekly bars into StatsSummary and not BoardStatsSection', () => {
    mockUseProfileData.mockReturnValue(
      mockProfileDataReturn({
        filteredLogbook: [
          {
            climbed_at: new Date().toISOString(),
            difficulty: 10,
            tries: 1,
            angle: 40,
            status: 'send',
            climbUuid: 'climb-1',
          },
        ],
        weeklyBars: [{ key: '2026-W1', label: 'W1', segments: [{ value: 2, color: '#ccc', label: 'V3' }] }],
      }),
    );

    render(<AnalyticsContent userId="user-2" />);

    expect(screen.getByTestId('stats-summary').getAttribute('data-has-weekly-bars')).toBe('true');
    expect(screen.getByTestId('board-stats-section').getAttribute('data-has-weekly-bars-prop')).toBe('false');
  });
});
