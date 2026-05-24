import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

// --- Locale catalogs imported from the web package ---
// Common (shared chrome)
import commonEn from '../../../../web/i18n/locales/en-US/common.json';
import commonEs from '../../../../web/i18n/locales/es/common.json';
import commonFr from '../../../../web/i18n/locales/fr/common.json';

// Auth
import authEn from '../../../../web/i18n/locales/en-US/auth.json';
import authEs from '../../../../web/i18n/locales/es/auth.json';
import authFr from '../../../../web/i18n/locales/fr/auth.json';

// Climbs
import climbsEn from '../../../../web/i18n/locales/en-US/climbs.json';
import climbsEs from '../../../../web/i18n/locales/es/climbs.json';
import climbsFr from '../../../../web/i18n/locales/fr/climbs.json';

// Session
import sessionEn from '../../../../web/i18n/locales/en-US/session.json';
import sessionEs from '../../../../web/i18n/locales/es/session.json';
import sessionFr from '../../../../web/i18n/locales/fr/session.json';

// Profile
import profileEn from '../../../../web/i18n/locales/en-US/profile.json';
import profileEs from '../../../../web/i18n/locales/es/profile.json';
import profileFr from '../../../../web/i18n/locales/fr/profile.json';

// Settings
import settingsEn from '../../../../web/i18n/locales/en-US/settings.json';
import settingsEs from '../../../../web/i18n/locales/es/settings.json';
import settingsFr from '../../../../web/i18n/locales/fr/settings.json';

// Playlists
import playlistsEn from '../../../../web/i18n/locales/en-US/playlists.json';
import playlistsEs from '../../../../web/i18n/locales/es/playlists.json';
import playlistsFr from '../../../../web/i18n/locales/fr/playlists.json';

// Notifications
import notificationsEn from '../../../../web/i18n/locales/en-US/notifications.json';
import notificationsEs from '../../../../web/i18n/locales/es/notifications.json';
import notificationsFr from '../../../../web/i18n/locales/fr/notifications.json';

// Feed
import feedEn from '../../../../web/i18n/locales/en-US/feed.json';
import feedEs from '../../../../web/i18n/locales/es/feed.json';
import feedFr from '../../../../web/i18n/locales/fr/feed.json';

// You (user's own page/stats)
import youEn from '../../../../web/i18n/locales/en-US/you.json';
import youEs from '../../../../web/i18n/locales/es/you.json';
import youFr from '../../../../web/i18n/locales/fr/you.json';

// Boards
import boardsEn from '../../../../web/i18n/locales/en-US/boards.json';
import boardsEs from '../../../../web/i18n/locales/es/boards.json';
import boardsFr from '../../../../web/i18n/locales/fr/boards.json';

// Aurora (sync-related)
import auroraEn from '../../../../web/i18n/locales/en-US/aurora.json';
import auroraEs from '../../../../web/i18n/locales/es/aurora.json';
import auroraFr from '../../../../web/i18n/locales/fr/aurora.json';

export const SUPPORTED_LOCALES = ['en-US', 'es', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-US';
export const DEFAULT_NAMESPACE = 'common';

/**
 * Namespaces available in the mobile app. Web-only namespaces
 * (marketing, admin) are excluded.
 */
export const MOBILE_NAMESPACES = [
  'common',
  'auth',
  'climbs',
  'session',
  'profile',
  'settings',
  'playlists',
  'notifications',
  'feed',
  'you',
  'boards',
  'aurora',
] as const;
export type MobileNamespace = (typeof MOBILE_NAMESPACES)[number];

const resources = {
  'en-US': {
    common: commonEn,
    auth: authEn,
    climbs: climbsEn,
    session: sessionEn,
    profile: profileEn,
    settings: settingsEn,
    playlists: playlistsEn,
    notifications: notificationsEn,
    feed: feedEn,
    you: youEn,
    boards: boardsEn,
    aurora: auroraEn,
  },
  es: {
    common: commonEs,
    auth: authEs,
    climbs: climbsEs,
    session: sessionEs,
    profile: profileEs,
    settings: settingsEs,
    playlists: playlistsEs,
    notifications: notificationsEs,
    feed: feedEs,
    you: youEs,
    boards: boardsEs,
    aurora: auroraEs,
  },
  fr: {
    common: commonFr,
    auth: authFr,
    climbs: climbsFr,
    session: sessionFr,
    profile: profileFr,
    settings: settingsFr,
    playlists: playlistsFr,
    notifications: notificationsFr,
    feed: feedFr,
    you: youFr,
    boards: boardsFr,
    aurora: auroraFr,
  },
} as const;

/**
 * Detect the best matching locale from the device settings.
 * Falls back to en-US if no supported locale matches.
 */
function detectDeviceLocale(): Locale {
  const deviceLocales = getLocales();

  for (const deviceLocale of deviceLocales) {
    // Try exact match first (e.g. "en-US")
    const exactTag = deviceLocale.languageTag as Locale;
    if ((SUPPORTED_LOCALES as readonly string[]).includes(exactTag)) {
      return exactTag;
    }

    // Try language-only match (e.g. "es" from "es-MX")
    const languageCode = deviceLocale.languageCode;
    if (languageCode) {
      const languageMatch = SUPPORTED_LOCALES.find(
        (locale) => locale === languageCode || locale.startsWith(`${languageCode}-`),
      );
      if (languageMatch) {
        return languageMatch;
      }
    }
  }

  return DEFAULT_LOCALE;
}

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources,
  lng: detectDeviceLocale(),
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: DEFAULT_NAMESPACE,
  ns: [...MOBILE_NAMESPACES],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
