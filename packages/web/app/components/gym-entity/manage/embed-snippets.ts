// Pure builders for the iframe snippets gym owners paste into their own
// websites. The URLs are uuid-keyed on purpose: board slugs are user-editable
// and gym slugs are nullable + editable, so a slug-keyed snippet pasted into a
// CMS would break on rename; uuids never move.

import { SITE_URL } from '@/app/lib/seo/base-url';

/** Escape a string for use inside an HTML attribute (either quote style). */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Iframe snippet for the live board view at /embed/board/{boardUuid}. */
export function buildBoardEmbedSnippet({ boardUuid, boardName }: { boardUuid: string; boardName: string }): string {
  const title = escapeHtmlAttribute(`${boardName} — live`);
  return `<iframe src="${SITE_URL}/embed/board/${boardUuid}" width="100%" height="640" style="border:0" loading="lazy" title="${title}"></iframe>`;
}

/**
 * Iframe snippet for the gym leaderboard at /embed/gym/{gymUuid}/leaderboard.
 * Defaults to the weekly window; the period query param also accepts day|month
 * (the embed dialog surfaces that note next to the snippet).
 */
export function buildLeaderboardEmbedSnippet({ gymUuid, gymName }: { gymUuid: string; gymName: string }): string {
  const title = escapeHtmlAttribute(`${gymName} — leaderboard`);
  return `<iframe src="${SITE_URL}/embed/gym/${gymUuid}/leaderboard?period=week" width="100%" height="520" style="border:0" loading="lazy" title="${title}"></iframe>`;
}
