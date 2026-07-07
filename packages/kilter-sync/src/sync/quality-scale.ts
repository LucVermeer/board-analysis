/**
 * Kilter Grips quality-average scale correction.
 *
 * The Kilter Grips catalog reports a single `qualityAverage` per (climb, angle)
 * that is a MIXED-SCALE blend upstream: legacy Aurora-era ratings live on the
 * raw 1-3 scale (Grips inherited Aurora's logbook), while Grips-era ratings are
 * native 1-5. Storing the value verbatim (as the sync originally did) left every
 * Aurora-era classic pinned near 3, so a 3-of-3 "classic" rendered as ~3-of-5.
 *
 * We can't tell an individual rating's scale from the aggregate, so we use the
 * climb's era as the discriminator: a climb whose first ascent (or, absent that,
 * creation) predates the Grips cutover is treated as Aurora-era 1-3 and mapped
 * onto 1-5 with the canonical affine `2q − 1`; a climb at/after the cutover (or
 * of unknown era) is assumed already native 1-5 and passed through unchanged.
 *
 * This is a deliberately coarse era heuristic: a pre-cutover climb that has since
 * accumulated Grips-era 1-5 ratings has a blended average that this converts (and
 * clamps) too aggressively. That trade-off is accepted — the dominant, visible
 * defect is the wall of Aurora-era classics stuck at 3.
 */

/**
 * Grips cutover: first ascents strictly before this are treated as Aurora-era
 * (raw 1-3); at/after it, native 1-5. Parsed once at module load.
 */
const GRIPS_CUTOVER_MS = Date.parse('2025-09-01T00:00:00Z');

/**
 * Correct a Kilter Grips `qualityAverage` onto the canonical 1-5 scale.
 *
 * - `null`/`undefined`/non-finite/`≤ 0`/`> 5` → `null` (unrated is never a 0
 *   rating; above 5 is garbage on either scale).
 * - pre-cutover era (`climbCreatedAtOrFaAt` parses to before 2025-09-01) →
 *   `clamp(2·raw − 1, 1, 5)` (Aurora-era 1-3 → 1-5).
 * - at/after the cutover, or an unknown era (`null`/unparseable) → `raw` as-is
 *   (assumed native Grips 1-5).
 *
 * @param raw the Grips-reported quality average
 * @param climbCreatedAtOrFaAt the stat row's `faAt` (preferred) or the climb's
 *   creation timestamp; `null` when neither is known (→ passthrough)
 */
export function correctGripsQualityAverage(
  raw: number | null | undefined,
  climbCreatedAtOrFaAt: string | null | undefined,
): number | null {
  if (raw == null) return null;
  const quality = Number(raw);
  // ≤ 0 is the "unrated" sentinel; > 5 is garbage on either scale (legacy tops
  // out at 3, native at 5) — reject both here so the function is self-contained
  // and no caller-side range guard is needed for out-of-range input to stay out
  // of the database.
  if (!Number.isFinite(quality) || quality <= 0 || quality > 5) return null;

  const eraMs = climbCreatedAtOrFaAt != null ? Date.parse(climbCreatedAtOrFaAt) : Number.NaN;
  // Unknown era (null / unparseable) or post-cutover → already native 1-5.
  if (Number.isNaN(eraMs) || eraMs >= GRIPS_CUTOVER_MS) return quality;

  // Aurora-era: raw 1-3 → 1-5 via the affine map, clamped defensively.
  return Math.min(5, Math.max(1, 2 * quality - 1));
}
