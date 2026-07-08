/**
 * Per-user UTC-offset inference for cross-source tick adoption.
 *
 * Background (the 3,208-duplicate bug): pre-PR4 the Aurora pull and the JSON
 * import stored a tick's `climbed_at` as the user's LOCAL wall-clock time
 * relabelled as UTC (a naive "YYYY-MM-DD HH:MM:SS" parsed as UTC), while the
 * Kilter PowerSync stream carries a true-UTC `created_at`. So the same physical
 * ascent lands with two timestamps that differ by the user's whole UTC offset
 * (e.g. +10h). The natural-key adoption in the sync paths matches on
 * (user, board, climb_uuid, angle, |Δt| ≤ 60s) — with a whole-offset gap the
 * ±60s window never matches, so the sync inserts a duplicate instead of
 * adopting the existing row.
 *
 * The fix: infer the user's offset from the ticks that DO line up (same climb
 * and angle) and accept an adoption when the timestamp gap is within tolerance
 * of that offset. Post-PR4 both sides write honest UTC, so the offset rounds to
 * 0 and the plain ±60s fast path handles everything; the inference only earns
 * its keep on historical, pre-fix rows.
 *
 * Pure + DB-agnostic so both kilter-sync (applyLogs) and aurora-sync /
 * web (the Aurora live-pull cross-source claim) can share one implementation.
 */

/** A tick reduced to the fields the offset inference needs. */
export type TickTimeSample = {
  climbUuid: string;
  angle: number;
  /** climbed_at (or the incoming log's created_at) as epoch milliseconds. */
  climbedAtMs: number;
};

/** Real-world UTC offsets top out at +14:00 / −12:00; cap candidate gaps here. */
export const MAX_USER_UTC_OFFSET_SECONDS = 14 * 60 * 60;

/**
 * Round the inferred offset to the nearest 15 minutes. Captures whole-hour,
 * half-hour (+9:30) and quarter-hour (+5:45) zones while snapping away the
 * sub-minute jitter between a client-stamped and a server-stamped timestamp.
 */
export const OFFSET_ROUNDING_SECONDS = 15 * 60;

/** Default adoption tolerance: a local clock can drift tens of seconds. */
export const NATURAL_KEY_TOLERANCE_SECONDS = 60;

function keyOf(sample: { climbUuid: string; angle: number }): string {
  return `${sample.climbUuid} ${sample.angle}`;
}

/**
 * Infer the user's UTC offset (in SECONDS, `existing − incoming`) from the
 * ticks that share a (climb_uuid, angle) between their existing history and the
 * incoming batch.
 *
 * For each (climb_uuid, angle) present in BOTH sets we take the single closest
 * existing↔incoming pair's Δt — one sample per key so a busy key can't
 * dominate — then take the MEDIAN across keys (robust to a minority of
 * mismatched keys / mixed honest+shifted history) and round to the nearest 15
 * minutes. Δt gaps beyond ±14h are dropped as implausible offsets (they're
 * genuinely different climbs that happen to share a key).
 *
 * Returns the offset in seconds (may be 0), or `null` when there are no
 * overlapping keys to infer from — the caller then relies on the ±60s fast
 * path alone.
 */
export function inferUserUtcOffsetSeconds(existing: TickTimeSample[], incoming: TickTimeSample[]): number | null {
  if (existing.length === 0 || incoming.length === 0) return null;

  const existingByKey = new Map<string, number[]>();
  for (const sample of existing) {
    const key = keyOf(sample);
    const list = existingByKey.get(key);
    if (list) list.push(sample.climbedAtMs);
    else existingByKey.set(key, [sample.climbedAtMs]);
  }

  const incomingByKey = new Map<string, number[]>();
  for (const sample of incoming) {
    const key = keyOf(sample);
    const list = incomingByKey.get(key);
    if (list) list.push(sample.climbedAtMs);
    else incomingByKey.set(key, [sample.climbedAtMs]);
  }

  const maxOffsetMs = MAX_USER_UTC_OFFSET_SECONDS * 1000;
  const perKeyDeltasMs: number[] = [];
  for (const [key, incomingMs] of incomingByKey) {
    const existingMs = existingByKey.get(key);
    if (!existingMs) continue;
    // Closest existing↔incoming pair for this key.
    let best: number | null = null;
    for (const inc of incomingMs) {
      for (const ex of existingMs) {
        const delta = ex - inc;
        if (Math.abs(delta) > maxOffsetMs) continue;
        if (best === null || Math.abs(delta) < Math.abs(best)) best = delta;
      }
    }
    if (best !== null) perKeyDeltasMs.push(best);
  }

  if (perKeyDeltasMs.length === 0) return null;

  perKeyDeltasMs.sort((a, b) => a - b);
  const mid = Math.floor(perKeyDeltasMs.length / 2);
  const medianMs =
    perKeyDeltasMs.length % 2 === 1 ? perKeyDeltasMs[mid] : (perKeyDeltasMs[mid - 1] + perKeyDeltasMs[mid]) / 2;

  const medianSeconds = medianMs / 1000;
  return Math.round(medianSeconds / OFFSET_ROUNDING_SECONDS) * OFFSET_ROUNDING_SECONDS;
}

/**
 * Adoption match SCORE for an existing tick vs an incoming log — lower is a
 * closer match, `null` means no match. Two tiers:
 *
 *   - Fast path (|Δt| ≤ tolerance): the honest same-instant ascent. Score lands
 *     in [0, tolerance].
 *   - Offset path (|Δt − offset| ≤ tolerance, only when an offset was inferred):
 *     a pre-fix timezone-shifted historical row. Score lands in
 *     (tolerance, 2·tolerance].
 *
 * The tiering guarantees a fast-path candidate ALWAYS outranks an offset-path
 * one. So when a shifted-history user has two distinct same-(climb, angle)
 * ascents and an incoming log sits within tolerance of BOTH the true
 * same-instant row and an offset-distant DISTINCT row, the caller (which picks
 * the lowest score) links the same-instant row and never merges the distinct
 * ascent. Within a tier the numerically closest wins.
 *
 * `offsetSeconds` null ⇒ fast path only.
 */
export function adoptionMatchScoreSeconds(
  existingMs: number,
  incomingMs: number,
  offsetSeconds: number | null,
  toleranceSeconds: number = NATURAL_KEY_TOLERANCE_SECONDS,
): number | null {
  const deltaMs = existingMs - incomingMs;
  const toleranceMs = toleranceSeconds * 1000;
  const absDeltaMs = Math.abs(deltaMs);
  if (absDeltaMs <= toleranceMs) return absDeltaMs / 1000;
  if (offsetSeconds !== null && offsetSeconds !== 0) {
    const offsetDistanceMs = Math.abs(deltaMs - offsetSeconds * 1000);
    if (offsetDistanceMs <= toleranceMs) return toleranceSeconds + offsetDistanceMs / 1000;
  }
  return null;
}

/**
 * Does an existing tick's climbed_at match an incoming log's timestamp for
 * adoption? True when the gap is within tolerance of 0 (the honest-UTC fast
 * path) OR — when an offset was inferred — within tolerance of that offset.
 * Thin boolean wrapper over adoptionMatchScoreSeconds (single source of truth).
 *
 * `offsetSeconds` null ⇒ fast path only.
 */
export function climbedAtMatchesForAdoption(
  existingMs: number,
  incomingMs: number,
  offsetSeconds: number | null,
  toleranceSeconds: number = NATURAL_KEY_TOLERANCE_SECONDS,
): boolean {
  return adoptionMatchScoreSeconds(existingMs, incomingMs, offsetSeconds, toleranceSeconds) !== null;
}
