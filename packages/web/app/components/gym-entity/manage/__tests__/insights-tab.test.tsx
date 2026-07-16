import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/app/test-utils/test-providers';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import type { Gym, GymStats } from '@boardsesh/shared-schema';
import InsightsTab, { computeWowDelta, busiestDayOfWeek } from '../insights-tab';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => ({ token: 'test-token', isAuthenticated: true, isLoading: false, error: null }),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-owner' } }, status: 'authenticated' }),
}));

const mockRequest = vi.fn();
vi.mock('@/app/lib/graphql/client', () => ({
  createGraphQLHttpClient: () => ({ request: mockRequest }),
}));

// The real CssBarChart pulls in @mui/x-charts; stub it so the tab test stays
// focused on stat cards / deltas / empty state.
vi.mock('@/app/components/charts/css-bar-chart', () => ({
  CssBarChart: ({ ariaLabel }: { ariaLabel?: string }) => <div role="img" aria-label={ariaLabel} />,
}));

const gym = { uuid: 'gym-uuid-1', name: 'Test Gym', slug: 'test-gym', ownerId: 'user-owner' } as unknown as Gym;

function renderTab() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <InsightsTab gym={gym} onGymChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

function makeStats(overrides: Partial<GymStats>): GymStats {
  return {
    gymUuid: gym.uuid,
    periodDays: 7,
    current: { uniqueClimbers: 8, ascentCount: 20 },
    previous: { uniqueClimbers: 5, ascentCount: 25 },
    topClimbs: [
      { climbUuid: 'c-x', boardType: 'kilter', angle: 40, name: 'Crimpy Traverse', gradeName: 'V4', ascentCount: 9 },
      { climbUuid: 'c-y', boardType: 'kilter', angle: 40, name: null, gradeName: null, ascentCount: 4 },
    ],
    busiestDays: [
      { dayOfWeek: 2, ascentCount: 6 },
      { dayOfWeek: 4, ascentCount: 14 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockRequest.mockReset();
});

describe('computeWowDelta', () => {
  it('classifies up, down and flat', () => {
    expect(computeWowDelta(8, 5)).toEqual({ diff: 3, direction: 'up' });
    expect(computeWowDelta(20, 25)).toEqual({ diff: -5, direction: 'down' });
    expect(computeWowDelta(7, 7)).toEqual({ diff: 0, direction: 'flat' });
  });
});

describe('busiestDayOfWeek', () => {
  it('returns the weekday with the most ascents, or null when empty', () => {
    expect(
      busiestDayOfWeek([
        { dayOfWeek: 2, ascentCount: 6 },
        { dayOfWeek: 4, ascentCount: 14 },
      ]),
    ).toBe(4);
    expect(busiestDayOfWeek([])).toBeNull();
  });
});

describe('InsightsTab', () => {
  it('renders stat values and week-over-week deltas', async () => {
    mockRequest.mockResolvedValue({ gymStats: makeStats({}) });
    renderTab();

    // Stat values.
    expect(await screen.findByText('8')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();

    // Up delta on unique climbers (+3), down delta on ascents (−5).
    const climbersDelta = screen.getByTestId('insights-delta-climbers');
    expect(climbersDelta.textContent).toMatch(/3/);
    expect(climbersDelta.textContent).toMatch(/vs last week/i);

    const ascentsDelta = screen.getByTestId('insights-delta-ascents');
    expect(ascentsDelta.textContent).toMatch(/5/);
    expect(ascentsDelta.textContent).toMatch(/vs last week/i);

    // Top climbs list resolves name + grade.
    expect(screen.getByText('Crimpy Traverse')).toBeTruthy();
    expect(screen.getByTestId('insights-top-climbs').textContent).toMatch(/V4/);
  });

  it('shows a flat delta when nothing changed', async () => {
    mockRequest.mockResolvedValue({
      gymStats: makeStats({
        current: { uniqueClimbers: 5, ascentCount: 20 },
        previous: { uniqueClimbers: 5, ascentCount: 12 },
      }),
    });
    renderTab();

    const climbersDelta = await screen.findByTestId('insights-delta-climbers');
    expect(climbersDelta.textContent).toMatch(/same as last week/i);
  });

  it('renders the climber-voice empty state when there are no sends this week', async () => {
    mockRequest.mockResolvedValue({
      gymStats: makeStats({ current: { uniqueClimbers: 0, ascentCount: 0 }, topClimbs: [], busiestDays: [] }),
    });
    renderTab();

    expect(await screen.findByText('No sends this week')).toBeTruthy();
    expect(screen.getByText(/time to reset the wall/i)).toBeTruthy();
    // The stat cards must not render in the empty state.
    expect(screen.queryByTestId('insights-delta-climbers')).toBeNull();
  });

  it('surfaces a load error state', async () => {
    mockRequest.mockRejectedValue(new Error('boom'));
    renderTab();

    await waitFor(() => {
      expect(screen.getByText(/couldn't load this week/i)).toBeTruthy();
    });
  });
});
