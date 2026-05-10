import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import AnalyticsClient from '../analytics-client';

const mocks = vi.hoisted(() => ({
  capturePosthog: vi.fn(),
  pageview: vi.fn(),
  track: vi.fn(),
  vitalCallbacks: [] as Array<(metric: Record<string, string | number | null>) => void>,
}));
let pathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

vi.mock('@/app/lib/analytics', () => ({
  capturePosthog: mocks.capturePosthog,
  pageview: mocks.pageview,
  track: mocks.track,
}));

vi.mock('web-vitals', () => ({
  onCLS: vi.fn((callback) => mocks.vitalCallbacks.push(callback)),
  onFCP: vi.fn((callback) => mocks.vitalCallbacks.push(callback)),
  onINP: vi.fn((callback) => mocks.vitalCallbacks.push(callback)),
  onLCP: vi.fn((callback) => mocks.vitalCallbacks.push(callback)),
  onTTFB: vi.fn((callback) => mocks.vitalCallbacks.push(callback)),
}));

describe('AnalyticsClient', () => {
  beforeEach(() => {
    pathname = '/';
    mocks.capturePosthog.mockClear();
    mocks.pageview.mockClear();
    mocks.track.mockClear();
    mocks.vitalCallbacks.length = 0;
  });

  it('sends path-only PostHog pageviews', async () => {
    pathname = '/b/kilter/list';

    render(<AnalyticsClient />);

    await waitFor(() => {
      expect(mocks.pageview).toHaveBeenCalledWith('/b/kilter/list');
    });
  });

  it('skips localized admin pageviews', async () => {
    pathname = '/fr/admin/retention';

    render(<AnalyticsClient />);

    await waitFor(() => {
      expect(mocks.pageview).not.toHaveBeenCalled();
    });
  });

  it('sends web vitals only to PostHog', async () => {
    render(<AnalyticsClient />);

    await waitFor(() => {
      expect(mocks.vitalCallbacks.length).toBeGreaterThan(0);
    });

    mocks.vitalCallbacks[0]({
      name: 'LCP',
      value: 123.4,
      rating: 'good',
      delta: 12.3,
      id: 'metric-1',
      navigationType: 'navigate',
    });

    expect(mocks.capturePosthog).toHaveBeenCalledWith('$web_vitals', {
      metric: 'LCP',
      value: 123.4,
      rating: 'good',
      delta: 12.3,
      id: 'metric-1',
      navigationType: 'navigate',
    });
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
