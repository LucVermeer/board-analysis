import { describe, expect, it } from 'vite-plus/test';
import {
  analyticsPathname,
  isAdminAnalyticsUrl,
  isEmbedAnalyticsUrl,
  stripAnalyticsLocalePrefix,
} from '../analytics-paths';

describe('analyticsPathname', () => {
  it('keeps only the pathname for absolute and relative URLs', () => {
    expect(analyticsPathname('https://boardsesh.com/b/kilter?session=abc#top')).toBe('/b/kilter');
    expect(analyticsPathname('/b/kilter?session=abc')).toBe('/b/kilter');
  });
});

describe('stripAnalyticsLocalePrefix', () => {
  it('strips supported non-default locale prefixes', () => {
    expect(stripAnalyticsLocalePrefix('/es/admin')).toBe('/admin');
    expect(stripAnalyticsLocalePrefix('/fr/admin/retention')).toBe('/admin/retention');
  });

  it('leaves unprefixed paths alone', () => {
    expect(stripAnalyticsLocalePrefix('/admin')).toBe('/admin');
    expect(stripAnalyticsLocalePrefix('/b/admin')).toBe('/b/admin');
  });
});

describe('isAdminAnalyticsUrl', () => {
  it('matches admin paths with optional locale prefixes', () => {
    expect(isAdminAnalyticsUrl('/admin')).toBe(true);
    expect(isAdminAnalyticsUrl('/admin/retention?range=30')).toBe(true);
    expect(isAdminAnalyticsUrl('/es/admin')).toBe(true);
    expect(isAdminAnalyticsUrl('https://boardsesh.com/fr/admin/retention')).toBe(true);
  });

  it('does not match lookalikes or query-only admin URLs', () => {
    expect(isAdminAnalyticsUrl('/administrator')).toBe(false);
    expect(isAdminAnalyticsUrl('/admin_panel')).toBe(false);
    expect(isAdminAnalyticsUrl('/b/admin')).toBe(false);
    expect(isAdminAnalyticsUrl('/fr/admin_panel')).toBe(false);
    expect(isAdminAnalyticsUrl('/?next=/admin')).toBe(false);
  });
});

describe('isEmbedAnalyticsUrl', () => {
  it('matches embed widget paths — no analytics inside third-party iframes', () => {
    expect(isEmbedAnalyticsUrl('/embed')).toBe(true);
    expect(isEmbedAnalyticsUrl('/embed/board/abc?x=1')).toBe(true);
    expect(isEmbedAnalyticsUrl('https://boardsesh.com/embed/gym/abc/leaderboard?period=day')).toBe(true);
  });

  it('is case-insensitive, mirroring the case-insensitive header matchers', () => {
    // Next's header source patterns compile case-insensitively, so
    // /EMBED/board/x receives the frameable embed headers — the analytics
    // suppression must cover the same set of paths.
    expect(isEmbedAnalyticsUrl('/EMBED/board/abc')).toBe(true);
    expect(isEmbedAnalyticsUrl('/Embed/gym/abc/leaderboard')).toBe(true);
  });

  it('does not match lookalikes or the kiosk (kiosk keeps first-party telemetry)', () => {
    expect(isEmbedAnalyticsUrl('/embedded')).toBe(false);
    expect(isEmbedAnalyticsUrl('/kiosk/some-gym')).toBe(false);
    expect(isEmbedAnalyticsUrl('/?next=/embed/board/abc')).toBe(false);
  });
});
