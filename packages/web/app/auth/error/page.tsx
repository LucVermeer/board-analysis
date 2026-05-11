import React, { Suspense } from 'react';
import { createNoIndexMetadata } from '@/app/lib/seo/metadata';
import { getLocale } from '@/app/lib/i18n/get-locale';
import { getServerTranslation } from '@/app/lib/i18n/server';
import I18nProvider from '@/app/components/providers/i18n-provider';
import AuthErrorContent from './auth-error-content';

export async function generateMetadata() {
  const { t, locale } = await getServerTranslation('auth');
  return createNoIndexMetadata({
    title: t('metadata.error.title'),
    description: t('metadata.error.description'),
    path: '/auth/error',
    locale,
  });
}

export default async function AuthErrorPage() {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} namespaces={['auth']}>
      <Suspense fallback={null}>
        <AuthErrorContent />
      </Suspense>
    </I18nProvider>
  );
}
