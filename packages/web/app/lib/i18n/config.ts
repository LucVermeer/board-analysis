export const SUPPORTED_LOCALES = ['en-US', 'es', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-US';

export const LOCALE_HTML_LANG: Record<Locale, string> = {
  'en-US': 'en',
  es: 'es',
  fr: 'fr',
};

export const LOCALE_OG: Record<Locale, string> = {
  'en-US': 'en_US',
  es: 'es_ES',
  fr: 'fr_FR',
};

export const LOCALE_LABELS: Record<Locale, string> = {
  'en-US': 'English',
  es: 'Español',
  fr: 'Français',
};

export const DEFAULT_NAMESPACE = 'common';
export const ROOT_NAMESPACES = ['common'] as const;
export const SEED_NAMESPACES = [
  'common',
  'marketing',
  'auth',
  'settings',
  'profile',
  'playlists',
  'climbs',
  'session',
  'notifications',
  'feed',
  'you',
  'admin',
  'aurora',
  'boards',
] as const;
export type SeedNamespace = (typeof SEED_NAMESPACES)[number];

export const LOCALE_HEADER = 'x-boardsesh-locale';
export const LOCALE_COOKIE = 'boardsesh-locale';

export function isSupportedLocale(value: string | undefined | null): value is Locale {
  return value != null && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// Keys used by packages/mobile/ — not referenced from packages/web/app/ but shared via the same JSON catalogs.
// i18n-keep climbs.mobile.emptyState.noBoard.title
// i18n-keep climbs.mobile.emptyState.noBoard.subtitle
// i18n-keep climbs.mobile.emptyState.noClimbs.title
// i18n-keep climbs.mobile.emptyState.noClimbs.subtitle
// i18n-keep climbs.mobile.emptyState.noMatches.title
// i18n-keep climbs.mobile.emptyState.noMatches.description
// i18n-keep climbs.mobile.contextMenu.addToQueue
// i18n-keep climbs.mobile.contextMenu.viewSetter
// i18n-keep climbs.mobile.detail.addToQueue
// i18n-keep climbs.mobile.detail.logAscent
// i18n-keep climbs.mobile.detail.notFound
// i18n-keep climbs.mobile.detail.boardPreview
// i18n-keep climbs.mobile.detail.send_one
// i18n-keep climbs.mobile.detail.send_other
// i18n-keep climbs.mobile.detail.sent_one
// i18n-keep climbs.mobile.detail.sent_other
// i18n-keep climbs.mobile.detail.sentWithAttempts_one
// i18n-keep climbs.mobile.detail.sentWithAttempts_other
// i18n-keep climbs.mobile.detail.attempt_one
// i18n-keep climbs.mobile.detail.attempt_other
// i18n-keep session.mobile.queue.noSessionTitle
// i18n-keep session.mobile.queue.noSessionSubtitle
// i18n-keep session.mobile.queue.emptyTitle
// i18n-keep session.mobile.queue.emptySubtitle
// i18n-keep session.mobile.queue.browseClimbs
// i18n-keep session.mobile.queue.noClimbSelected
// i18n-keep session.mobile.queue.unknownClimb
// i18n-keep profile.mobile.unknownName
// i18n-keep profile.mobile.signOut
// i18n-keep boards.mobile.activeBoard
// i18n-keep boards.mobile.emptyTitle
// i18n-keep boards.mobile.emptySubtitle
// i18n-keep common.mobile.more.title
// i18n-keep common.mobile.nav.boards
// i18n-keep common.mobile.nav.climbs
// i18n-keep common.mobile.nav.climb
// i18n-keep common.mobile.nav.queue
// i18n-keep common.mobile.nav.profile
// i18n-keep auth.nativeStart.tagline
// i18n-keep auth.nativeStart.signInApple
// i18n-keep auth.nativeStart.signInGoogle
