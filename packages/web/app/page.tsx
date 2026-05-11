import React from 'react';
import { createPageMetadata } from '@/app/lib/seo/metadata';
import { getServerTranslation } from '@/app/lib/i18n/server';
import { getLocale } from '@/app/lib/i18n/get-locale';
import I18nProvider from '@/app/components/providers/i18n-provider';
import { getAllBoardConfigs } from './lib/server-board-configs';
import { getPopularBoardConfigs } from './lib/server-popular-configs';
import { buildPopularLcpImageUrl } from './lib/popular-lcp-preload';
import HomePageContent from './home-page-content';

export async function generateMetadata() {
  const { t, locale } = await getServerTranslation('marketing');
  return createPageMetadata({
    title: t('metadata.home.title'),
    description: t('metadata.home.description'),
    ogDescription: t('metadata.home.ogDescription'),
    path: '/',
    locale,
  });
}

export default async function Home() {
  const [boardConfigs, popularConfigs, locale] = await Promise.all([
    getAllBoardConfigs(),
    getPopularBoardConfigs(),
    getLocale(),
  ]);
  const lcpPreloadUrl = buildPopularLcpImageUrl(popularConfigs);

  return (
    <I18nProvider locale={locale} namespaces={['marketing', 'boards', 'climbs', 'profile', 'feed']}>
      {lcpPreloadUrl && <link rel="preload" as="image" href={lcpPreloadUrl} fetchPriority="high" />}
      <HomePageContent boardConfigs={boardConfigs} initialPopularConfigs={popularConfigs} />
    </I18nProvider>
  );
}
