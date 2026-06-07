import type { AscentFeedItem } from '@boardsesh/graphql/operations';

// Climb names shorter than this (after normalization) match too much random
// caption text to be trustworthy, so we skip them and let the user pick
// manually. Tunable; 4 keeps out "up", "yes", "g2"-style names.
const MIN_MATCHABLE_NAME_LENGTH = 4;

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
 * Find which of the user's recent ascents the shared reel is about by looking
 * for their climb names inside the post caption. Matches whole names on word
 * boundaries (so "Crimp" doesn't match "Crimpy McCrimpface"), de-dupes by climb,
 * and ranks longer (more specific) names first — the strongest match leads.
 *
 * Returns [] when there's no caption or no confident hit, in which case the
 * screen falls back to the plain recent-ascents list. Pure + side-effect free
 * for unit testing.
 */
export function matchAscentsToCaption(caption: string | null | undefined, ascents: AscentFeedItem[]): AscentFeedItem[] {
  if (!caption) return [];
  const haystack = ` ${normalizeForMatch(caption)} `;
  if (haystack.trim().length === 0) return [];

  const seen = new Set<string>();
  const scored: { ascent: AscentFeedItem; score: number }[] = [];

  for (const ascent of ascents) {
    const name = normalizeForMatch(ascent.climbName);
    if (name.length < MIN_MATCHABLE_NAME_LENGTH) continue;
    if (!haystack.includes(` ${name} `)) continue;
    if (seen.has(ascent.climbUuid)) continue;
    seen.add(ascent.climbUuid);
    scored.push({ ascent, score: name.length });
  }

  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.ascent);
}

export type ShareBetaList = {
  suggestions: AscentFeedItem[];
  listData: AscentFeedItem[];
};

/**
 * Split the recent-ascents list for the share-beta picker into caption-matched
 * "suggestions" and the remaining "other ascents", with the matched climbs
 * pulled out of the main list so they aren't shown twice. While the user is
 * actively searching we hand control back to them — no suggestions, the full
 * (already name-filtered) list flows through. Pure for unit testing.
 */
export function partitionAscentsForShare(
  caption: string | null | undefined,
  ascents: AscentFeedItem[],
  isSearching: boolean,
): ShareBetaList {
  const suggestions = isSearching ? [] : matchAscentsToCaption(caption, ascents);
  if (suggestions.length === 0) {
    return { suggestions, listData: ascents };
  }
  const suggestedUuids = new Set(suggestions.map((ascent) => ascent.climbUuid));
  return { suggestions, listData: ascents.filter((ascent) => !suggestedUuids.has(ascent.climbUuid)) };
}
