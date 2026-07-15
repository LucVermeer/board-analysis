import { z } from 'zod';
import {
  IFRAME_TITLE_MAX_LENGTH,
  IFRAME_URL_MAX_LENGTH,
  KIOSK_GRID_COLUMNS,
  KIOSK_GRID_ROWS,
  KIOSK_LAYOUT_VERSION,
  MAX_KIOSK_WIDGETS,
  RECENT_SENDS_DEFAULT_LIMIT,
  RECENT_SENDS_MAX_LIMIT,
  RECENT_SENDS_MIN_LIMIT,
  SESSION_LEADERBOARD_DEFAULT_WINDOW_MINUTES,
  SESSION_LEADERBOARD_MAX_WINDOW_MINUTES,
  SESSION_LEADERBOARD_MIN_WINDOW_MINUTES,
  UP_NEXT_DEFAULT_COUNT,
  UP_NEXT_MAX_COUNT,
  UP_NEXT_MIN_COUNT,
  WIDGET_TYPE_IFRAME,
  WIDGET_TYPE_NOW_ON_THE_WALL,
  WIDGET_TYPE_RECENT_SENDS,
  WIDGET_TYPE_SESSION_LEADERBOARD,
  WIDGET_TYPE_UP_NEXT,
} from './constants';

/**
 * A widget's placement on the fixed 12-column x 8-row kiosk grid. `x`/`y` are the
 * top-left cell (0-indexed); `w`/`h` are the span in cells. Bounds keep a widget
 * from starting off-grid or claiming more cells than exist — the renderer trusts
 * these are in-range, and the manage-editor snaps drags/resizes to them.
 */
export const GridPositionSchema = z.object({
  x: z
    .number()
    .int()
    .min(0)
    .max(KIOSK_GRID_COLUMNS - 1),
  y: z
    .number()
    .int()
    .min(0)
    .max(KIOSK_GRID_ROWS - 1),
  w: z.number().int().min(1).max(KIOSK_GRID_COLUMNS),
  h: z.number().int().min(1).max(KIOSK_GRID_ROWS),
});

export type GridPosition = z.infer<typeof GridPositionSchema>;

// Every widget carries a stable instance `id` (the embed URL keys off it, so it
// must survive renames/edits) and a grid `position`.
const widgetBaseShape = {
  id: z.uuid(),
  position: GridPositionSchema,
};

// --- iframe URL refinement ----------------------------------------------------
// Kept as small pure predicates so each rejection reason surfaces its own error
// and the checks read the same on the backend and in the manage form.

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** hostname is boardsesh.com itself or any subdomain of it. */
function isBoardseshHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'boardsesh.com' || host.endsWith('.boardsesh.com');
}

/**
 * Gym-supplied embed URL for the external-iframe widget. Refinements, in order:
 * parseable, https-only (no http/data/javascript), no `user:pass@` userinfo
 * (credential leak), and not a boardsesh.com host (the widget iframes are
 * sandboxed and would otherwise let a gym recursively embed Boardsesh / escape
 * the sandbox via same-origin). Downstream refinements no-op on an unparseable
 * string so a bad URL reports exactly one error.
 */
export const IframeUrlSchema = z
  .string()
  .max(IFRAME_URL_MAX_LENGTH, `URL must be at most ${IFRAME_URL_MAX_LENGTH} characters`)
  .refine((value) => tryParseUrl(value) !== null, 'Enter a valid URL')
  .refine((value) => {
    const parsed = tryParseUrl(value);
    return parsed === null || parsed.protocol === 'https:';
  }, 'Only https:// URLs can be embedded')
  .refine((value) => {
    const parsed = tryParseUrl(value);
    return parsed === null || (parsed.username === '' && parsed.password === '');
  }, 'URL must not contain a username or password')
  .refine((value) => {
    const parsed = tryParseUrl(value);
    return parsed === null || !isBoardseshHost(parsed.hostname);
  }, 'Boardsesh URLs cannot be embedded');

// --- Per-type widget schemas (discriminated-union members) --------------------

export const NowOnTheWallWidgetSchema = z.object({
  ...widgetBaseShape,
  type: z.literal(WIDGET_TYPE_NOW_ON_THE_WALL),
  boardUuid: z.uuid(),
});

export const UpNextWidgetSchema = z.object({
  ...widgetBaseShape,
  type: z.literal(WIDGET_TYPE_UP_NEXT),
  boardUuid: z.uuid(),
  count: z.number().int().min(UP_NEXT_MIN_COUNT).max(UP_NEXT_MAX_COUNT).default(UP_NEXT_DEFAULT_COUNT),
});

export const SessionLeaderboardWidgetSchema = z.object({
  ...widgetBaseShape,
  type: z.literal(WIDGET_TYPE_SESSION_LEADERBOARD),
  boardUuids: z.array(z.uuid()).min(1, 'Pick at least one board'),
  windowMinutes: z
    .number()
    .int()
    .min(SESSION_LEADERBOARD_MIN_WINDOW_MINUTES)
    .max(SESSION_LEADERBOARD_MAX_WINDOW_MINUTES)
    .default(SESSION_LEADERBOARD_DEFAULT_WINDOW_MINUTES),
});

export const RecentSendsWidgetSchema = z.object({
  ...widgetBaseShape,
  type: z.literal(WIDGET_TYPE_RECENT_SENDS),
  boardUuids: z.array(z.uuid()).min(1, 'Pick at least one board'),
  limit: z.number().int().min(RECENT_SENDS_MIN_LIMIT).max(RECENT_SENDS_MAX_LIMIT).default(RECENT_SENDS_DEFAULT_LIMIT),
});

export const IframeWidgetSchema = z.object({
  ...widgetBaseShape,
  type: z.literal(WIDGET_TYPE_IFRAME),
  url: IframeUrlSchema,
  title: z.string().max(IFRAME_TITLE_MAX_LENGTH).optional(),
});

/**
 * One kiosk widget. Discriminated on `type` so an unknown type fails fast (and
 * the lenient reader can drop it) rather than silently matching a loose union.
 */
export const KioskWidgetSchema = z.discriminatedUnion('type', [
  NowOnTheWallWidgetSchema,
  UpNextWidgetSchema,
  SessionLeaderboardWidgetSchema,
  RecentSendsWidgetSchema,
  IframeWidgetSchema,
]);

export type NowOnTheWallWidget = z.infer<typeof NowOnTheWallWidgetSchema>;
export type UpNextWidget = z.infer<typeof UpNextWidgetSchema>;
export type SessionLeaderboardWidget = z.infer<typeof SessionLeaderboardWidgetSchema>;
export type RecentSendsWidget = z.infer<typeof RecentSendsWidgetSchema>;
export type IframeWidget = z.infer<typeof IframeWidgetSchema>;
export type KioskWidget = z.infer<typeof KioskWidgetSchema>;

/**
 * Strict writer schema — the shape the backend validates every `create/updateGymKiosk`
 * mutation against, and what the manage-UI serialises. Rejects unknown widget
 * types, over-`MAX_KIOSK_WIDGETS` layouts, and any version other than the current
 * one. Reading persisted layouts (which may predate the running code) goes through
 * `parseKioskLayoutLenient` instead.
 */
export const KioskLayoutSchema = z.object({
  version: z.literal(KIOSK_LAYOUT_VERSION),
  widgets: z.array(KioskWidgetSchema).max(MAX_KIOSK_WIDGETS),
});

export type KioskLayout = z.infer<typeof KioskLayoutSchema>;

/** The default empty layout a freshly created kiosk row stores. */
export function emptyKioskLayout(): KioskLayout {
  return { version: KIOSK_LAYOUT_VERSION, widgets: [] };
}

export interface LenientKioskLayoutResult {
  /** The layout with only the widgets that still validate under the current code. */
  layout: KioskLayout;
  /** How many stored widgets were dropped (invalid, or an unknown/newer type). */
  droppedWidgetCount: number;
}

/**
 * Forward-compatible reader for a persisted `layout` jsonb. This is the contract
 * that lets us add widget types without breaking already-open TVs running older
 * JS: rather than reject the whole layout when it meets one widget it can't parse,
 * the reader drops the offending widget and renders the rest.
 *
 * Rules:
 * - A top-level `version` this code doesn't recognise (a future breaking bump) is
 *   uninterpretable, so return an empty layout rather than guess.
 * - Otherwise `safeParse` each widget independently, keep the valid ones, and
 *   count the drops (unknown type, malformed config, out-of-range position...).
 * - Non-object / missing-widgets input yields an empty layout, never a throw.
 *
 * The strict `KioskLayoutSchema` remains the write-time gate; this is read-time only.
 */
export function parseKioskLayoutLenient(value: unknown): LenientKioskLayoutResult {
  if (typeof value !== 'object' || value === null) {
    return { layout: emptyKioskLayout(), droppedWidgetCount: 0 };
  }

  const record = value as { version?: unknown; widgets?: unknown };

  if (record.version !== KIOSK_LAYOUT_VERSION) {
    return { layout: emptyKioskLayout(), droppedWidgetCount: 0 };
  }

  if (!Array.isArray(record.widgets)) {
    return { layout: emptyKioskLayout(), droppedWidgetCount: 0 };
  }

  const widgets: KioskWidget[] = [];
  let droppedWidgetCount = 0;

  for (const candidate of record.widgets) {
    const parsed = KioskWidgetSchema.safeParse(candidate);
    if (parsed.success) {
      widgets.push(parsed.data);
    } else {
      droppedWidgetCount += 1;
    }
  }

  // Defensive cap: a writer that bypassed the strict schema shouldn't be able to
  // make a TV render more widgets than the grid budget allows.
  if (widgets.length > MAX_KIOSK_WIDGETS) {
    droppedWidgetCount += widgets.length - MAX_KIOSK_WIDGETS;
    widgets.length = MAX_KIOSK_WIDGETS;
  }

  return { layout: { version: KIOSK_LAYOUT_VERSION, widgets }, droppedWidgetCount };
}
