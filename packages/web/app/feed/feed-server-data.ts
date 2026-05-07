import { getServerAuthToken } from '../lib/auth/server-auth';
import { cachedSessionGroupedFeed, serverMyBoards } from '../lib/graphql/server-cached-client';
import type { SessionFeedResult, UserBoard } from '@boardsesh/shared-schema';

export type FeedTab = 'sessions' | 'proposals' | 'comments';
export const VALID_FEED_TABS: FeedTab[] = ['sessions', 'proposals', 'comments'];

export type FeedSSRData = {
  tab: FeedTab;
  boardUuid: string | undefined;
  isAuthenticatedSSR: boolean;
  initialFeedResult: SessionFeedResult | null;
  initialMyBoards: UserBoard[] | null;
};

export async function loadFeedSSR(searchParams: Record<string, string | string[] | undefined>): Promise<FeedSSRData> {
  const tab = (VALID_FEED_TABS.includes(searchParams.tab as FeedTab) ? searchParams.tab : 'sessions') as FeedTab;
  const boardUuid = typeof searchParams.board === 'string' ? searchParams.board : undefined;

  const authToken = await getServerAuthToken();
  const isAuthenticatedSSR = !!authToken;

  let initialFeedResult: SessionFeedResult | null = null;
  let initialMyBoards: UserBoard[] | null = null;

  if (authToken) {
    const feedPromise =
      tab === 'sessions' ? cachedSessionGroupedFeed(boardUuid, true).catch(() => null) : Promise.resolve(null);
    const boardsPromise = serverMyBoards(authToken);
    const [feedResult, boardsResult] = await Promise.all([feedPromise, boardsPromise]);
    initialFeedResult = feedResult;
    initialMyBoards = boardsResult;
  } else if (tab === 'sessions') {
    try {
      initialFeedResult = await cachedSessionGroupedFeed(boardUuid, false);
    } catch {
      // Feed fetch failed, client will retry
    }
  }

  return { tab, boardUuid, isAuthenticatedSSR, initialFeedResult, initialMyBoards };
}
