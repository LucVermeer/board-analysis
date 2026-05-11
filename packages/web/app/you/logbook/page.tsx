import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import LogbookFeed from '@/app/components/library/logbook-feed';
import LogbookLoading from './loading';
import { cachedUserProfileStats } from '@/app/lib/graphql/server-cached-client';
import { getYouSession } from '../you-auth';
import { createNoIndexMetadata } from '@/app/lib/seo/metadata';
import { getServerTranslation } from '@/app/lib/i18n/server';

export async function generateMetadata() {
  const { t, locale } = await getServerTranslation('you');
  return createNoIndexMetadata({
    title: t('metadata.logbook.title'),
    description: t('metadata.logbook.description'),
    path: '/you/logbook',
    locale,
  });
}

export default async function YouLogbookPage() {
  const session = await getYouSession();
  if (!session?.user?.id) {
    redirect('/');
  }
  const userId = session.user.id;
  const profileStats = await cachedUserProfileStats(userId);
  const layoutStats = profileStats?.layoutStats ?? [];

  // translate="no" prevents in-browser translators (Google Translate, etc.) from
  // mutating React-controlled DOM nodes inside this virtualized list. The
  // translator was orphaning text nodes between renders and crashing the
  // reconciler with removeChild NotFoundError. See issue #2064.
  return (
    <Box translate="no">
      <Suspense fallback={<LogbookLoading />}>
        <LogbookFeed layoutStats={layoutStats} loadingLayoutStats={false} />
      </Suspense>
    </Box>
  );
}
