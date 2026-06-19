// Match a shared reel's caption against a climber's logged climbs by name.
// Pure + dependency-free so both the mobile share flow and the backend
// caption-match resolver run the exact same logic over their own data shapes.

// Climb names shorter than this (after normalization) match too much random
// caption text to be trustworthy, so we skip them and let the user pick
// manually. Tunable; 4 keeps out "up", "yes", "g2"-style names.
export const MIN_MATCHABLE_NAME_LENGTH = 4;

/** The minimal shape the matcher reads off a logged climb / ascent. */
export type CaptionMatchableClimb = {
  climbName: string;
  climbUuid: string;
};

/**
 * Lowercase, strip diacritics, and reduce to single-spaced alphanumerics so a
 * caption like "Sent *Purple Nurple* 🔥 @ 40°" and a climb name "Purple Nurple"
 * compare cleanly.
 */
function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find which of the climber's logged climbs the shared reel is about by looking
 * for their climb names inside the post caption. Matches whole names on word
 * boundaries (so "Crimp" doesn't match "Crimpy McCrimpface"), de-dupes by climb,
 * and ranks longer (more specific) names first — the strongest match leads.
 *
 * Returns [] when there's no caption or no confident hit. Generic over the row
 * shape so callers keep their full type (a mobile AscentFeedItem, a backend name
 * row) on the way out; only `climbName` + `climbUuid` are read.
 */
export function matchClimbsToCaption<T extends CaptionMatchableClimb>(
  caption: string | null | undefined,
  climbs: T[],
): T[] {
  if (!caption) return [];
  const haystack = ` ${normalizeForMatch(caption)} `;
  if (haystack.trim().length === 0) return [];

  const seen = new Set<string>();
  const scored: { climb: T; score: number }[] = [];

  for (const climb of climbs) {
    const name = normalizeForMatch(climb.climbName);
    if (name.length < MIN_MATCHABLE_NAME_LENGTH) continue;
    if (!haystack.includes(` ${name} `)) continue;
    if (seen.has(climb.climbUuid)) continue;
    seen.add(climb.climbUuid);
    scored.push({ climb, score: name.length });
  }

  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.climb);
}
