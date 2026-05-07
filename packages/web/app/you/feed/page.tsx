import React from 'react';
import FeedPageContent from '../../feed/feed-page-content';
import { loadFeedSSR } from '../../feed/feed-server-data';
import { createNoIndexMetadata } from '@/app/lib/seo/metadata';
import { getServerTranslation } from '@/app/lib/i18n/server';

export async function generateMetadata() {
  const { t, locale } = await getServerTranslation('feed');
  return createNoIndexMetadata({
    title: t('metadata.feed.title'),
    description: t('metadata.feed.description'),
    path: '/you/feed',
    locale,
  });
}

type YouFeedProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Auth gate is handled by you/layout.tsx (redirects unauthenticated users to /).
// I18nProvider for the `feed` namespace is also set up in the parent layout.
export default async function YouFeedPage({ searchParams }: YouFeedProps) {
  const params = await searchParams;
  const ssr = await loadFeedSSR(params);

  return (
    <FeedPageContent
      basePath="/you/feed"
      initialTab={ssr.tab}
      initialBoardUuid={ssr.boardUuid}
      initialFeedResult={ssr.initialFeedResult}
      isAuthenticatedSSR={ssr.isAuthenticatedSSR}
      initialMyBoards={ssr.initialMyBoards}
    />
  );
}
