export const SUPPORTED_LOCALES = ['en-US', 'es', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-US';

// Keys used only by the React Native mobile app (packages/mobile/),
// outside the web orphan checker's scan tree.
// i18n-keep common:mobile.play.sendCount_one
// i18n-keep common:mobile.play.sendCount_other
// i18n-keep session:playView.actionBar.previousAria
// i18n-keep session:playView.actionBar.nextAria
// i18n-keep session:playView.actionBar.mirrorAria
// i18n-keep session:playView.actionBar.unmirrorAria
// i18n-keep session:playView.actionBar.addFavoriteAria
// i18n-keep session:playView.actionBar.removeFavoriteAria
// i18n-keep session:playView.actionBar.sendToBoardAria
// i18n-keep session:playView.actionBar.queueCountAria
// i18n-keep auth:nativeStart.networkError
// i18n-keep auth:nativeStart.orContinueWith
// i18n-keep auth:nativeStart.signIn

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
