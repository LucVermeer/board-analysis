import React from 'react';
import Box from '@mui/material/Box';
import MuiTypography from '@mui/material/Typography';
import { NotificationList } from '@/app/components/notifications';
import { serverGroupedNotifications } from '@/app/lib/graphql/server-cached-client';
import { getServerAuthToken } from '@/app/lib/auth/server-auth';
import { createNoIndexMetadata } from '@/app/lib/seo/metadata';
import { getServerTranslation } from '@/app/lib/i18n/server';
import { getLocale } from '@/app/lib/i18n/get-locale';
import I18nProvider from '@/app/components/providers/i18n-provider';
import { withSsrTimeout } from '@/app/lib/ssr-timeout';

export async function generateMetadata() {
  const { t, locale } = await getServerTranslation('notifications');
  return createNoIndexMetadata({
    title: t('metadata.notifications.title'),
    description: t('metadata.notifications.description'),
    path: '/notifications',
    locale,
  });
}

export default async function NotificationsPage() {
  const [authToken, locale, { t }] = await Promise.all([
    getServerAuthToken(),
    getLocale(),
    getServerTranslation('notifications'),
  ]);

  let initialData = null;
  if (authToken) {
    initialData = await withSsrTimeout(
      serverGroupedNotifications(authToken).catch((error) => {
        console.error('[notifications/page] SSR fetch failed, falling back to client:', error);
        return null;
      }),
      null,
    );
  }

  return (
    <I18nProvider locale={locale} namespaces={['notifications']}>
      <Box sx={{ pb: 10 }}>
        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <MuiTypography variant="h6" fontWeight={600}>
            {t('title')}
          </MuiTypography>
        </Box>
        <NotificationList initialData={initialData} />
      </Box>
    </I18nProvider>
  );
}
