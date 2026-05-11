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

  // Regression guard for #2061 (Sentry BOARDSESH-65): RootLayout is a Server
  // Component, so any function prop on these wrappers would be serialized
  // across the RSC boundary and throw "Functions cannot be passed directly
  // to Client Components". Keep the wrappers prop-less so contributors
  // can't accidentally pass `beforeSend` (or any callback) from the layout.
  it('exports no-arg wrappers so the layout cannot pass function props', () => {
    expect(VercelAnalytics.length).toBe(0);
    expect(VercelSpeedInsights.length).toBe(0);
  });

  it('keeps the beforeSend identity stable across renders', () => {
    render(<VercelAnalytics />);
    const first = mocks.analyticsBeforeSend;
    mocks.analyticsBeforeSend = undefined;
    render(<VercelAnalytics />);

    // Module-scoped function — same reference each render. Inlining it as
    // `<Analytics beforeSend={(e) => ...} />` would create a fresh function
    // each call, which still works at runtime but defeats the stability
    // contract @vercel/analytics relies on for its `useEffect([beforeSend])`.
    expect(mocks.analyticsBeforeSend).toBe(first);
  });
});
