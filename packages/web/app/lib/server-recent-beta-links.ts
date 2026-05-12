import React from 'react';
import 'server-only';
import { GraphQLClient } from 'graphql-request';
import { getGraphQLHttpUrl } from '@/app/lib/graphql/client';
import { GET_RECENT_BETA_LINKS } from '@/app/lib/graphql/operations/beta-links';
import type { BetaLinksGqlRow } from '@/app/lib/beta-video-url';

export type RecentBetaLinkRow = {
  climbName: string | null;
  boardType: string;
  betaLink: BetaLinksGqlRow;
};

type RecentBetaLinksResponse = {
  recentBetaLinks: RecentBetaLinkRow[];
};

/**
 * Fetches the latest cross-climb beta videos for the home-screen slider.
 * Mirrors `server-popular-configs.ts`: React.cache for request dedupe, a
 * 1s timeout, and a silent fall back to `[]` so a backend hiccup doesn't
 * fail the page render — the client section will retry on mount.
 */
export const getRecentBetaLinks = React.cache(async (limit = 20): Promise<RecentBetaLinkRow[]> => {
  let url: string;
  try {
    url = getGraphQLHttpUrl();
  } catch {
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const client = new GraphQLClient(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    const result = await client.request<RecentBetaLinksResponse>(GET_RECENT_BETA_LINKS, { limit });
    return result.recentBetaLinks;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
});
