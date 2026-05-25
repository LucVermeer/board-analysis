import 'server-only';
import { unstable_cache } from 'next/cache';
import { GET_USER_BETA_LINKS } from '@boardsesh/graphql/operations/beta-links';
import { executeGraphQLInternal } from '@/app/lib/graphql/server-cached-client';
import type { RecentBetaLinkRow } from '@/app/lib/server-recent-beta-links';

type UserBetaLinksResponse = {
  userBetaLinks: RecentBetaLinkRow[];
};

const REVALIDATE_SECONDS = 300;
const FETCH_TIMEOUT_MS = 3000;

function buildFetcher(userId: string, limit: number) {
  const tag = `user-beta-links-${userId}`;
  return unstable_cache(
    async (): Promise<RecentBetaLinkRow[]> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const result = await executeGraphQLInternal<UserBetaLinksResponse>(
          GET_USER_BETA_LINKS,
          { userId, limit },
          controller.signal,
        );
        return result.userBetaLinks;
      } finally {
        clearTimeout(timer);
      }
    },
    ['user-beta-links', userId, String(limit)],
    { revalidate: REVALIDATE_SECONDS, tags: [tag] },
  );
}

export async function getUserBetaLinks(userId: string, limit = 50): Promise<RecentBetaLinkRow[]> {
  try {
    return await buildFetcher(userId, limit)();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[home-page-ssr] userBetaLinks fetch failed:', err instanceof Error ? err.message : err);
    }
    return [];
  }
}
