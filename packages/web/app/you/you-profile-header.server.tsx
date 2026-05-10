import React from 'react';
import MuiAvatar from '@mui/material/Avatar';
import MuiCard from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { PersonOutlined } from '@mui/icons-material';
import { getServerTranslation } from '@/app/lib/i18n/server';
import type { UserProfile } from '@/app/profile/[user_id]/utils/profile-constants';
import styles from '@/app/profile/[user_id]/profile-page.module.css';

type YouProfileHeaderProps = {
  profile: UserProfile;
};

export default async function YouProfileHeader({ profile }: YouProfileHeaderProps) {
  const { t } = await getServerTranslation('profile');
  const displayName = profile.profile?.displayName || profile.name || t('page.displayNameFallback');
  const avatarUrl = profile.profile?.avatarUrl || profile.image;

  return (
    <MuiCard className={styles.profileCard}>
      <CardContent>
        <div className={styles.profileInfo}>
          <MuiAvatar sx={{ width: 80, height: 80 }} src={avatarUrl ?? undefined}>
            {!avatarUrl && <PersonOutlined />}
          </MuiAvatar>
          <div className={styles.profileDetails}>
            <Typography variant="h6" component="h1" className={styles.displayName}>
              {displayName}
            </Typography>
            <Typography variant="body2" component="span" color="text.secondary">
              {t('page.followerCountSummary', {
                followers: profile.followerCount,
                following: profile.followingCount,
              })}
            </Typography>
          </div>
        </div>
      </CardContent>
    </MuiCard>
  );
}
