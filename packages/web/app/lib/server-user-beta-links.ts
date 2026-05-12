import React from 'react';
import 'server-only';
import { GraphQLClient } from 'graphql-request';
import { getGraphQLHttpUrl } from '@/app/lib/graphql/client';
import { GET_USER_BETA_LINKS } from '@/app/lib/graphql/operations/beta-links';
import type { RecentBetaLinkRow } from '@/app/lib/server-recent-beta-links';

type UserBetaLinksResponse = {
  userBetaLinks: RecentBetaLinkRow[];
};

/**
 * Fetches a single user's beta videos for the profile-page slider. Same
 * shape as the home slider (RecentBetaLinkRow) — the only difference is
 * the resolver filters by user instead of capping per-poster. Errors and
 * timeouts fall back to `[]` so a backend hiccup doesn't fail the page
 * render; the client section will retry on mount.
 */
export const getUserBetaLinks = React.cache(async (userId: string, limit = 50): Promise<RecentBetaLinkRow[]> => {
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
    const result = await client.request<UserBetaLinksResponse>(GET_USER_BETA_LINKS, { userId, limit });
    return result.userBetaLinks;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
});
