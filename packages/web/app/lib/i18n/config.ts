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
// i18n-keep session:mobile.logbook.title
// i18n-keep session:mobile.logbook.noEntries
// i18n-keep session:mobile.logbook.sendsAndAttempts
// i18n-keep session:mobile.logbook.sendsOnly
// i18n-keep session:mobile.logbook.attemptsOnly
// i18n-keep session:mobile.similarClimbs.title
// i18n-keep session:mobile.similarClimbs.empty
// i18n-keep session:mobile.similarClimbs.loading
// i18n-keep session:mobile.community.title
// i18n-keep session:mobile.community.empty
// i18n-keep session:mobile.community.ascensionists_one
// i18n-keep session:mobile.community.ascensionists_other
// i18n-keep session:mobile.community.avgQuality
// i18n-keep session:mobile.betaVideos.title
// i18n-keep session:mobile.betaVideos.empty
// i18n-keep session:mobile.betaVideos.videoCount_one
// i18n-keep session:mobile.betaVideos.videoCount_other
// i18n-keep session:mobile.betaVideos.addButton
// i18n-keep session:mobile.betaVideos.addTitle
// i18n-keep session:mobile.betaVideos.urlPlaceholder
// i18n-keep session:mobile.betaVideos.submitButton
// i18n-keep session:mobile.betaVideos.submitting
// i18n-keep session:mobile.betaVideos.attachSuccess
// i18n-keep session:mobile.betaVideos.attachError
// i18n-keep session:mobile.angleSelector.title
// i18n-keep session:mobile.queueSheet.emptyQueue
// i18n-keep session:mobile.queueSheet.toggleHistory
// i18n-keep session:mobile.queueSheet.editQueue
// i18n-keep session:mobile.queueSheet.doneEditing
// i18n-keep session:mobile.queue.noSessionTitle
// i18n-keep session:mobile.queue.noSessionSubtitle
// i18n-keep session:mobile.queue.emptyTitle
// i18n-keep session:mobile.queue.emptySubtitle
// i18n-keep session:mobile.queue.browseClimbs
// i18n-keep session:mobile.queue.previousClimb
// i18n-keep session:mobile.queue.nextClimb
// i18n-keep session:mobile.queue.logAscent
// i18n-keep session:mobile.queue.noClimbSelected
// i18n-keep session:queueList.showFullHistory_one
// i18n-keep session:queueList.showFullHistory_other
// i18n-keep session:queueDrawer.title
// i18n-keep session:queueDrawer.clear
// i18n-keep session:queueDrawer.removeItems_one
// i18n-keep session:queueDrawer.removeItems_other
// i18n-keep session:playView.tickBar.starRating_one
// i18n-keep session:playView.tickBar.starRating_other
// i18n-keep session:queueList.showFullHistoryAria_one
// i18n-keep session:queueList.showFullHistoryAria_other
// i18n-keep climbs:mobile.climbActions.copyLink
// i18n-keep climbs:mobile.climbActions.linkCopied
// i18n-keep climbs:mobile.climbActions.report
// i18n-keep session:playView.tickBar.cancelLabel
// i18n-keep session:playView.tickBar.decreaseTriesAria
// i18n-keep session:playView.tickBar.flashSaveLabel
// i18n-keep session:playView.tickBar.gradeLabel
// i18n-keep session:playView.tickBar.increaseTriesAria
// i18n-keep session:playView.tickBar.logAscentAria
// i18n-keep session:playView.tickBar.sendSaveLabel
// i18n-keep session:playView.tickBar.starsLabel
// i18n-keep session:playView.tickBar.triesLabel

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
