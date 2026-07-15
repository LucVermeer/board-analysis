/**
 * Shared kiosk-dashboard limits and identifiers, so the backend write validator,
 * the web renderer, and the manage-UI editor all agree on the same numbers. A
 * client that caps below the backend limit silently truncates a valid layout;
 * one that caps above it lets the owner build a kiosk the mutation then rejects
 * with no inline explanation.
 */

/**
 * On-disk layout schema version. Bump only for a breaking layout-shape change;
 * older clients treat any version they don't recognise as an empty layout (see
 * `parseKioskLayoutLenient`), so a bump is a hard cutover, not a soft migration.
 */
export const KIOSK_LAYOUT_VERSION = 1;

/** Most widgets one kiosk can hold. The strict writer schema enforces this. */
export const MAX_KIOSK_WIDGETS = 12;

/** Most kiosks (TV configs) a single gym can create. Enforced backend-side. */
export const MAX_KIOSKS_PER_GYM = 10;

/**
 * The kiosk canvas is a fixed 12-column by 8-row grid. Widget `position`
 * ({x,y,w,h}) is expressed in these grid units, so a 1920x1080 TV and the scaled
 * manage-editor canvas lay widgets out identically.
 */
export const KIOSK_GRID_COLUMNS = 12;
export const KIOSK_GRID_ROWS = 8;

// Widget type discriminators. Kept as named constants so the discriminated-union
// members, the registry, and the manage-UI palette all reference one source.
export const WIDGET_TYPE_NOW_ON_THE_WALL = 'now-on-the-wall';
export const WIDGET_TYPE_UP_NEXT = 'up-next';
export const WIDGET_TYPE_SESSION_LEADERBOARD = 'session-leaderboard';
export const WIDGET_TYPE_RECENT_SENDS = 'recent-sends';
export const WIDGET_TYPE_IFRAME = 'iframe';

/** Every kiosk widget type, in palette order. */
export const KIOSK_WIDGET_TYPES = [
  WIDGET_TYPE_NOW_ON_THE_WALL,
  WIDGET_TYPE_UP_NEXT,
  WIDGET_TYPE_SESSION_LEADERBOARD,
  WIDGET_TYPE_RECENT_SENDS,
  WIDGET_TYPE_IFRAME,
] as const;

export type KioskWidgetType = (typeof KIOSK_WIDGET_TYPES)[number];

// --- Per-widget config bounds (shared so client caps match backend rejects) ---

/** `up-next`: how many upcoming climbs to preview. */
export const UP_NEXT_MIN_COUNT = 1;
export const UP_NEXT_MAX_COUNT = 10;
export const UP_NEXT_DEFAULT_COUNT = 5;

/** `session-leaderboard`: rolling window (minutes) the ranking looks back over. */
export const SESSION_LEADERBOARD_MIN_WINDOW_MINUTES = 5;
export const SESSION_LEADERBOARD_MAX_WINDOW_MINUTES = 1440; // 24h
export const SESSION_LEADERBOARD_DEFAULT_WINDOW_MINUTES = 180;

/** `recent-sends`: how many recent sends to list. */
export const RECENT_SENDS_MIN_LIMIT = 1;
export const RECENT_SENDS_MAX_LIMIT = 25;
export const RECENT_SENDS_DEFAULT_LIMIT = 10;

/**
 * `iframe`: gym-supplied external URL. Length capped to keep a pasted tracking
 * URL from ballooning the layout jsonb; the URL is further constrained
 * (https-only, no credentials, not a boardsesh.com host) in `widget-config.ts`.
 */
export const IFRAME_URL_MAX_LENGTH = 2000;
export const IFRAME_TITLE_MAX_LENGTH = 100;
