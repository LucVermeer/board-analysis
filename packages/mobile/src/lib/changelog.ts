/**
 * App-facing accessors for the "What's New" changelog screen.
 *
 * Entries come from a build-time generated JSON (scripts/generate-changelog.ts)
 * that crawls merged-PR `## Release Notes` sections. The copy is English-only
 * data — like the acknowledgements names, it's not run through i18n; only the
 * surrounding chrome (titles, the current-build chip, category labels) is
 * translated. The file is small and bounded, so it's imported statically rather
 * than lazily loaded.
 */
import { tickTimeMs } from '@boardsesh/profile-stats';
import data from '../data/changelog.generated.json';

export type ChangelogCategory = 'new' | 'improved' | 'fixed';

export type ChangelogEntry = {
  prNumber: number;
  category: ChangelogCategory;
  title: string;
  /** Optional secondary line — the remaining Release Notes copy after the title. */
  body?: string;
  /** ISO timestamp the PR merged at. */
  mergedAt: string;
  prUrl: string;
};

export type ChangelogData = {
  generatedAt: string;
  entries: ChangelogEntry[];
};

const rawData = data as ChangelogData;

// The generator already emits newest-first, but sort defensively so a hand-edited
// or differently-ordered snapshot still renders reverse-chronologically. Uses
// tickTimeMs (the same dayjs-backed parser the rest of the app uses) so an
// unparseable date sorts last rather than poisoning the comparison. tickTimeMs
// throws on an empty string, so guard that before calling it.
function mergedAtMs(entry: ChangelogEntry): number {
  if (!entry.mergedAt) return Number.NEGATIVE_INFINITY;
  const parsed = tickTimeMs(entry.mergedAt);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export const entries: ChangelogEntry[] = [...rawData.entries].sort((a, b) => mergedAtMs(b) - mergedAtMs(a));

/** The newest entry's `mergedAt`, or `null` when the changelog is empty. */
export const latestEntryDate: string | null = entries.length > 0 ? entries[0].mergedAt : null;
