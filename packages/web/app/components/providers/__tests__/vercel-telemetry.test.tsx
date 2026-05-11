import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { VercelAnalytics, VercelSpeedInsights } from '../vercel-telemetry';

type TelemetryEvent = { url: string };
type BeforeSend = (event: TelemetryEvent) => TelemetryEvent | null;

const mocks = vi.hoisted(() => ({
  analyticsBeforeSend: undefined as BeforeSend | undefined,
  speedBeforeSend: undefined as BeforeSend | undefined,
}));

vi.mock('@vercel/analytics/react', () => ({
  Analytics: (props: { beforeSend?: BeforeSend }) => {
    mocks.analyticsBeforeSend = props.beforeSend;
    return null;
  },
}));

vi.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: (props: { beforeSend?: BeforeSend }) => {
    mocks.speedBeforeSend = props.beforeSend;
    return null;
  },
}));

function expectAdminFilter(beforeSend: BeforeSend | undefined): void {
  expect(beforeSend).toBeTypeOf('function');

  const adminEvent = { url: '/fr/admin/retention?range=30' };
  const lookalikeEvent = { url: '/administrator' };
  const nestedAdminEvent = { url: '/b/admin' };

  expect(beforeSend?.(adminEvent)).toBeNull();
  expect(beforeSend?.(lookalikeEvent)).toBe(lookalikeEvent);
  expect(beforeSend?.(nestedAdminEvent)).toBe(nestedAdminEvent);
}

describe('Vercel telemetry providers', () => {
  beforeEach(() => {
    mocks.analyticsBeforeSend = undefined;
    mocks.speedBeforeSend = undefined;
  });

  it('wires the admin page filter into Vercel Analytics', () => {
    render(<VercelAnalytics />);

    expectAdminFilter(mocks.analyticsBeforeSend);
  });

  it('wires the admin page filter into Speed Insights', () => {
    render(<VercelSpeedInsights />);

    expectAdminFilter(mocks.speedBeforeSend);
  });
});
