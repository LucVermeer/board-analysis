/**
 * @deprecated Aurora interop only. The structured `no_match` characteristic
 * (see {@link isNoMatch} and `board_climbs.characteristics`) is now the internal
 * source of truth. This regex stays because Aurora encodes "no match" as a
 * `No match\n` description prefix that we still ingest and derive from — use it
 * only on the ingest/wire-format boundary, never as the internal read path.
 */
export function isNoMatchClimb(description: string | null | undefined): boolean {
  return /^no match/i.test(description || '');
}

/** Canonical marker prepended to a description to flag a "no match" climb. */
const NO_MATCH_PREFIX = 'No match\n';

/**
 * @deprecated Aurora interop only. Toggle the "no match" marker on a climb
 * description (the Aurora wire format). The structured `no_match` characteristic
 * is now the internal source of truth; only keep encoding the prefix on paths
 * that read/write Aurora descriptions. Enabling prepends a canonical marker when
 * one isn't already present; disabling strips a leading no-match line.
 */
export function withNoMatch(description: string | null | undefined, enabled: boolean): string {
  const current = description ?? '';
  if (enabled) {
    return isNoMatchClimb(current) ? current : `${NO_MATCH_PREFIX}${current}`;
  }
  // Only strip our own canonical marker — "no match" as the entire first line
  // (optionally followed by a newline). Arbitrary user prose that merely starts
  // with "no match…" (e.g. "No matching feet allowed") is left intact so
  // toggling off can never delete a real description. A real is_no_match column
  // is the proper fix.
  return current.replace(/^no match(?:\r?\n|$)/i, '');
}

/**
 * Convert an Aurora quality rating (1-3) to a Boardsesh quality rating (1-5).
 *
 * Aurora's Kilter/Tension logbook stores user star ratings on a 1-3 scale
 * (0 means "unrated" and maps to null). Boardsesh stores them on a 1-5 scale.
 * We map endpoints exactly (1->1, 3->5) with 2->3 in the middle via linear
 * interpolation, and clamp defensively in case Aurora ever returns values
 * outside 1-3.
 */
export function convertQuality(auroraQuality: number | null | undefined): number | null {
  if (auroraQuality == null) return null;
  const q = Number(auroraQuality);
  if (!Number.isFinite(q) || q <= 0) return null;
  const clamped = Math.min(3, Math.max(1, q));
  return Math.round(((clamped - 1) / 2) * 4) + 1;
}

/**
 * Scale a 1-3 quality *average* onto the 1-5 scale Kilter Grips / MoonBoard
 * use, so board_climb_stats.quality_average is one scale the UI renders the
 * same way for every board. This is the continuous (non-rounding) sibling of
 * {@link convertQuality}: both use the affine map `2q − 1` (1→1, 2→3, 3→5),
 * which is the ONLY linear transform that agrees with convertQuality at the
 * endpoints and the midpoint. Because AVG is linear, `2·avg − 1` is the
 * correct way to rescale an *average* of 1-3 ratings onto 1-5 — the old ×5/3
 * scaling ([1,3]→[1.67,5]) was wrong and inflated low-rated climbs by up to
 * +0.67 stars. Input is clamped to [1,3] defensively (like convertQuality);
 * 0/null ("unrated") stays null. Unlike convertQuality this does NOT round, so
 * a stored average keeps its precision.
 *
 * ⚠️ Input must be a 1-3-scale value. The clamp exists for out-of-range noise,
 * not for scale mixing — feeding an already-normalized 1-5 average in here
 * silently clamps everything ≥ 3 up to 5.
 */
export function normalizeQualityTo5(quality: number | null | undefined): number | null {
  if (quality == null) return null;
  const q = Number(quality);
  if (!Number.isFinite(q) || q <= 0) return null;
  const clamped = Math.min(3, Math.max(1, q));
  return 2 * clamped - 1;
}

/**
 * Convert a Boardsesh quality rating (1-5) back to an Aurora rating (1-3),
 * for pushing ticks to Aurora backends (which reject values above 3).
 *
 * Inverse of convertQuality: endpoints map exactly (1->1, 5->3) and the
 * middle interpolates linearly (2->2, 3->2, 4->3), so convertQuality
 * round-trips (1->1->1, 2->3->2, 3->5->3). 0/null ("unrated") stays null;
 * out-of-range input is clamped to 1-5 defensively.
 *
 * Has no production callers today; kept for the Aurora/Tension push path.
 * Do NOT use it for the Kilter Grips push (`packages/kilter-sync`) — Grips
 * ticks are natively 1-5, so converting there silently downscales them.
 */
export function convertQualityToAurora(quality: number | null | undefined): number | null {
  if (quality == null) return null;
  const q = Number(quality);
  if (!Number.isFinite(q) || q <= 0) return null;
  const clamped = Math.min(5, Math.max(1, q));
  return Math.round(((clamped - 1) / 4) * 2) + 1;
}

/**
 * Whether a playlist colour already uses the canonical six-digit CSS hex form.
 *
 * This intentionally rejects the empty string: mutation inputs use `''` as a
 * separate clear signal. Renderers that need to support persisted legacy
 * shorthand should use {@link normalizePlaylistColor} instead.
 */
export function isValidPlaylistColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Convert a playlist colour from a persisted legacy or upstream representation
 * into the canonical `#RRGGBB` form used by renderers and new writes.
 *
 * The leading `#` is optional because Aurora's circuit payloads omit it while
 * Kilter payloads may include it. Three-digit shorthand is expanded one
 * channel at a time. Anything other than three or six hexadecimal digits is
 * rejected so callers can safely fall back instead of passing arbitrary text
 * to a renderer or persisting it.
 */
export function normalizePlaylistColor(color: string | null | undefined): string | null {
  if (color == null) return null;

  const match = /^#?([0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?)$/.exec(color);
  if (!match) return null;

  const hexDigits = match[1].toUpperCase();
  const expandedHexDigits =
    hexDigits.length === 3
      ? `${hexDigits[0]}${hexDigits[0]}${hexDigits[1]}${hexDigits[1]}${hexDigits[2]}${hexDigits[2]}`
      : hexDigits;

  return `#${expandedHexDigits}`;
}
