import React from 'react';
import YouPageClient from './you-page-client';
import { createNoIndexMetadata } from '@/app/lib/seo/metadata';
import { getServerTranslation } from '@/app/lib/i18n/server';

export async function generateMetadata() {
  const { t, locale } = await getServerTranslation('you');
  return createNoIndexMetadata({
    title: t('metadata.dashboard.title'),
    description: t('metadata.dashboard.description'),
    path: '/you',
    locale,
  });
}

export default function YouPage() {
  return <YouPageClient />;
}
