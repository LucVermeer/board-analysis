import 'server-only';
import { unstable_cache } from 'next/cache';
import { GET_RECENT_BETA_LINKS } from '@boardsesh/graphql/operations/beta-links';
import { executeGraphQLInternal } from '@/app/lib/graphql/server-cached-client';
import type { BetaLinksGqlRow } from '@/app/lib/beta-video-url';

export type RecentBetaLinkRow = {
  climbName: string | null;
  boardType: string;
  layoutId: number | null;
  betaLink: BetaLinksGqlRow;
};

type RecentBetaLinksResponse = {
  recentBetaLinks: RecentBetaLinkRow[];
};

const CACHE_TAG = 'recent-beta-links';
const REVALIDATE_SECONDS = 300;
const FETCH_TIMEOUT_MS = 3000;

function buildFetcher(limit: number) {
  return unstable_cache(
    async (): Promise<RecentBetaLinkRow[]> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const result = await executeGraphQLInternal<RecentBetaLinksResponse>(
          GET_RECENT_BETA_LINKS,
          { limit },
          controller.signal,
        );
        return result.recentBetaLinks;
      } finally {
        clearTimeout(timer);
      }
    },
    ['recent-beta-links', String(limit)],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAG] },
  );
}

export async function getRecentBetaLinks(limit = 20): Promise<RecentBetaLinkRow[]> {
  try {
    return await buildFetcher(limit)();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[home-page-ssr] recentBetaLinks fetch failed:', err instanceof Error ? err.message : err);
    }
    return [];
  }
}
