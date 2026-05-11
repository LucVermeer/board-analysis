import React from 'react';
import { getServerAuthToken } from '../lib/auth/server-auth';
import FeedPageContent from './feed-page-content';
import { cachedSessionGroupedFeed, serverMyBoards } from '../lib/graphql/server-cached-client';
import type { SessionFeedResult, UserBoard } from '@boardsesh/shared-schema';
import { createPageMetadata } from '@/app/lib/seo/metadata';
import { getServerTranslation } from '@/app/lib/i18n/server';
import { getLocale } from '@/app/lib/i18n/get-locale';
import I18nProvider from '@/app/components/providers/i18n-provider';

export async function generateMetadata() {
  const { t, locale } = await getServerTranslation('feed');
  return createPageMetadata({
    title: t('metadata.feed.title'),
    description: t('metadata.feed.description'),
    path: '/feed',
    locale,
  });
}

type FeedTab = 'sessions' | 'proposals' | 'comments';
const VALID_TABS: FeedTab[] = ['sessions', 'proposals', 'comments'];

type FeedProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// SSR fetch budget: if the cold-path GraphQL handshake doesn't return
// within this window, fall back to `initialFeedResult = null` and let the
// client take over. The page still renders quickly; the client's React
// Query hook fetches the real data once it mounts.
//
// Previously this page had no SSR timeout. On cold cache against a slow
// backend (e.g. CI's local-pub/sub mode without REDIS_URL), the SSR fetch
// could exceed Playwright's 30s navigation timeout — the recurring
// shard-4 flake mode in the bottom-tab-bar persistence test, which falls
// back to `page.goto('/feed')` after the click-doesn't-navigate symptom.
const SSR_FETCH_TIMEOUT_MS = 5_000;

function withSsrTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), SSR_FETCH_TIMEOUT_MS);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export default async function FeedPage({ searchParams }: FeedProps) {
  const params = await searchParams;

  // Parse URL state
  const tab = (VALID_TABS.includes(params.tab as FeedTab) ? params.tab : 'sessions') as FeedTab;
  const boardUuid = typeof params.board === 'string' ? params.board : undefined;

  // Read auth cookie to determine if user is authenticated at SSR time
  const authToken = await getServerAuthToken();
  const isAuthenticatedSSR = !!authToken;

  // SSR: fetch boards + feed in parallel
  let initialFeedResult: SessionFeedResult | null = null;
  let initialMyBoards: UserBoard[] | null = null;

  if (authToken) {
    const feedPromise =
      tab === 'sessions'
        ? withSsrTimeout(
            cachedSessionGroupedFeed(boardUuid, true).catch(() => null),
            null,
          )
        : Promise.resolve(null);
    const boardsPromise = withSsrTimeout(
      serverMyBoards(authToken).catch(() => null),
      null,
    );

    const [feedResult, boardsResult] = await Promise.all([feedPromise, boardsPromise]);
    initialFeedResult = feedResult;
    initialMyBoards = boardsResult;
  } else if (tab === 'sessions') {
    initialFeedResult = await withSsrTimeout(
      cachedSessionGroupedFeed(boardUuid, false).catch(() => null),
      null,
    );
  }

  const locale = await getLocale();

  return (
    <I18nProvider locale={locale} namespaces={['feed']}>
      <FeedPageContent
        initialTab={tab}
        initialBoardUuid={boardUuid}
        initialFeedResult={initialFeedResult}
        isAuthenticatedSSR={isAuthenticatedSSR}
        initialMyBoards={initialMyBoards}
      />
    </I18nProvider>
  );
}
