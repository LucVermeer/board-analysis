import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './i18n/config';

const DEFAULT_ANALYTICS_BASE_URL = 'https://boardsesh.com';

export function analyticsPathname(url: string, baseUrl = DEFAULT_ANALYTICS_BASE_URL): string {
  try {
    return new URL(url, baseUrl).pathname;
  } catch {
    const path = url.split(/[?#]/, 1)[0] || '/';
    return path.startsWith('/') ? path : `/${path}`;
  }
}

export function stripAnalyticsLocalePrefix(pathname: string): string {
  for (const locale of SUPPORTED_LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const prefix = `/${locale}`;
    if (pathname === prefix) return '/';
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }

  return pathname;
}

export function isAdminAnalyticsUrl(url: string, baseUrl = DEFAULT_ANALYTICS_BASE_URL): boolean {
  const pathname = stripAnalyticsLocalePrefix(analyticsPathname(url, baseUrl));
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/**
 * /embed/** — iframe widgets running INSIDE third-party gym websites. Those
 * visitors never saw Boardsesh, its privacy policy, or any consent surface,
 * so no analytics (PostHog pageviews/web-vitals, Vercel Analytics, Speed
 * Insights) may capture there — GDPR/ePrivacy consent can't be assumed from
 * an embedded widget. First-party surfaces (including /kiosk/**) keep their
 * telemetry.
 *
 * Case-insensitive and locale-stripped to cover every path variant the
 * middleware carve-out and the case-insensitive header matchers accept
 * (e.g. /EMBED/board/x).
 */
export function isEmbedAnalyticsUrl(url: string, baseUrl = DEFAULT_ANALYTICS_BASE_URL): boolean {
  const pathname = stripAnalyticsLocalePrefix(analyticsPathname(url, baseUrl)).toLowerCase();
  return pathname === '/embed' || pathname.startsWith('/embed/');
}
