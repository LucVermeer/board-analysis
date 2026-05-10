import React, { Suspense } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { redirect } from 'next/navigation';
import { getProfileData } from '../profile/[user_id]/server-profile-data';
import { fetchProfileStatsData } from '../profile/[user_id]/server-profile-stats';
import { getYouSession } from './you-auth';
import YouProgressContent from './you-progress-content';
import YouProfileHeader from './you-profile-header.server';
import type { UserProfile } from '@/app/profile/[user_id]/utils/profile-constants';
import styles from '@/app/profile/[user_id]/profile-page.module.css';
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

async function YouProgressStreaming({
  userId,
  initialProfile,
}: {
  userId: string;
  initialProfile: UserProfile | null;
}) {
  const statsData = await fetchProfileStatsData(userId);
  return (
    <YouProgressContent
      userId={userId}
      initialProfile={initialProfile}
      initialProfileStats={statsData.initialProfileStats}
      initialPercentile={statsData.initialPercentile}
      initialAllBoardsTicks={statsData.initialAllBoardsTicks}
      initialLogbook={statsData.initialLogbook}
    />
  );
}

export default async function YouPage() {
  const session = await getYouSession();
  if (!session?.user?.id) {
    redirect('/');
  }
  const userId = session.user.id;

  const initialProfile = await getProfileData(userId, userId);

  return (
    <>
      {initialProfile && <YouProfileHeader profile={initialProfile} />}
      <Suspense
        fallback={
          <Box className={styles.loadingContent}>
            <CircularProgress size={48} />
          </Box>
        }
      >
        <YouProgressStreaming userId={userId} initialProfile={initialProfile} />
      </Suspense>
    </>
  );
}
