// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import ClimbAnalytics from '../climb-analytics';

vi.mock('react-i18next', () => {
  const keys: Record<string, string> = {
    'analytics.noData': 'No analytics data available yet. Data is collected during sync.',
    'analytics.ascentsOverTime': 'Ascents Over Time',
    'analytics.qualityOverTime': 'Quality Over Time',
    'analytics.gradeOverTime': 'Grade Over Time',
  };
  return {
    useTranslation: () => ({
      t: (key: string) => keys[key] ?? key,
      i18n: { language: 'en-US' },
    }),
    Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
  };
});

const mockRequest = vi.fn();
const mockLineChart = vi.fn();

vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: mockRequest }),
}));

vi.mock('@/app/hooks/use-grade-format', () => ({
  useGradeFormat: () => ({
    gradeFormat: 'v-grade' as const,
    formatGrade: (d: string | null | undefined) => {
      if (!d) return null;
      const match = d.match(/V\d+/i);
      return match ? match[0].toUpperCase() : d;
    },
    getGradeColor: () => undefined,
    loaded: true,
    setGradeFormat: () => Promise.resolve(),
  }),
}));

vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: (props: unknown) => {
    mockLineChart(props);
    return <div data-testid="mui-line-chart" />;
  },
}));

type MockLineChartProps = {
  series: Array<Record<string, unknown>>;
  xAxis: Array<{ tickInterval?: (value: string, index: number) => boolean }>;
};

const MOCK_RESPONSE = {
  climbStatsHistory: [
    {
      angle: 25,
      ascensionistCount: 10,
      qualityAverage: 2.6,
      difficultyAverage: 16.2,
      displayDifficulty: 16,
      createdAt: '2024-01-15T00:00:00.000Z',
    },
    {
      angle: 25,
      ascensionistCount: 12,
      qualityAverage: 2.8,
      difficultyAverage: 16.8,
      displayDifficulty: 17,
      createdAt: '2024-02-15T00:00:00.000Z',
    },
    {
      angle: 40,
      ascensionistCount: 5,
      qualityAverage: 3.1,
      difficultyAverage: 18.1,
      displayDifficulty: 18,
      createdAt: '2024-01-20T00:00:00.000Z',
    },
    {
      angle: 40,
      ascensionistCount: 8,
      qualityAverage: 3.3,
      difficultyAverage: 18.5,
      displayDifficulty: 19,
      createdAt: '2024-02-20T00:00:00.000Z',
    },
  ],
};

function getLatestChartProps(): [MockLineChartProps, MockLineChartProps, MockLineChartProps] {
  const calls = mockLineChart.mock.calls.slice(-3);
  return [calls[0][0] as MockLineChartProps, calls[1][0] as MockLineChartProps, calls[2][0] as MockLineChartProps];
}

describe('ClimbAnalytics', () => {
  beforeEach(() => {
    mockRequest.mockResolvedValue(MOCK_RESPONSE);
    mockRequest.mockClear();
    mockLineChart.mockClear();
  });

  it('renders stacked area ascent series and keeps quality as unstacked lines', async () => {
    render(<ClimbAnalytics climbUuid="climb-1" boardType="kilter" />);

    await waitFor(() => {
      expect(screen.getAllByTestId('mui-line-chart')).toHaveLength(3);
    });

    const [ascentsChart, qualityChart, gradeChart] = getLatestChartProps();

    expect(ascentsChart.series).toHaveLength(2);
    expect(ascentsChart.series).toEqual([
      expect.objectContaining({
        label: '25°',
        data: [10, 12],
        area: true,
        stack: 'ascents',
        showMark: false,
      }),
      expect.objectContaining({
        label: '40°',
        data: [5, 8],
        area: true,
        stack: 'ascents',
        showMark: false,
      }),
    ]);
    expect(typeof ascentsChart.xAxis[0]?.tickInterval).toBe('function');

    expect(qualityChart.series).toHaveLength(2);
    expect(qualityChart.series).toEqual([
      expect.objectContaining({
        label: '25°',
        data: [2.6, 2.8],
        showMark: true,
      }),
      expect.objectContaining({
        label: '40°',
        data: [3.1, 3.3],
        showMark: true,
      }),
    ]);
    expect(qualityChart.series.every((series) => !('area' in series))).toBe(true);
    expect(qualityChart.series.every((series) => !('stack' in series))).toBe(true);
    expect(typeof qualityChart.xAxis[0]?.tickInterval).toBe('function');

    expect(gradeChart.series).toHaveLength(2);
    expect(gradeChart.series).toEqual([
      expect.objectContaining({
        label: '25°',
        data: [16.2, 16.8],
        showMark: true,
      }),
      expect.objectContaining({
        label: '40°',
        data: [18.1, 18.5],
        showMark: true,
      }),
    ]);
    expect(typeof gradeChart.xAxis[0]?.tickInterval).toBe('function');
  });

  it('does not render the removed total ascents chart', async () => {
    render(<ClimbAnalytics climbUuid="climb-1" boardType="kilter" />);

    await waitFor(() => {
      expect(screen.getAllByTestId('mui-line-chart')).toHaveLength(3);
    });

    expect(screen.getByText('Ascents Over Time')).toBeTruthy();
    expect(screen.getByText('Quality Over Time')).toBeTruthy();
    expect(screen.getByText('Grade Over Time')).toBeTruthy();
    expect(screen.queryByText('Total Ascents (All Angles)')).toBeNull();
  });

  it('updates visible series when filtering and keeps the last angle selected', async () => {
    render(<ClimbAnalytics climbUuid="climb-1" boardType="kilter" />);

    await waitFor(() => {
      expect(screen.getAllByTestId('mui-line-chart')).toHaveLength(3);
    });

    fireEvent.click(screen.getByRole('button', { name: '25°' }));

    await waitFor(() => {
      const [ascentsChart, qualityChart, gradeChart] = getLatestChartProps();
      expect(ascentsChart.series).toHaveLength(1);
      expect(qualityChart.series).toHaveLength(1);
      expect(gradeChart.series).toHaveLength(1);
      expect(ascentsChart.series[0]).toEqual(expect.objectContaining({ label: '40°' }));
      expect(qualityChart.series[0]).toEqual(expect.objectContaining({ label: '40°' }));
      expect(gradeChart.series[0]).toEqual(expect.objectContaining({ label: '40°' }));
    });

    fireEvent.click(screen.getByRole('button', { name: '40°' }));

    await waitFor(() => {
      const [ascentsChart, qualityChart, gradeChart] = getLatestChartProps();
      expect(ascentsChart.series).toHaveLength(1);
      expect(qualityChart.series).toHaveLength(1);
      expect(gradeChart.series).toHaveLength(1);
      expect(ascentsChart.series[0]).toEqual(expect.objectContaining({ label: '40°' }));
      expect(qualityChart.series[0]).toEqual(expect.objectContaining({ label: '40°' }));
      expect(gradeChart.series[0]).toEqual(expect.objectContaining({ label: '40°' }));
    });
  });
});
