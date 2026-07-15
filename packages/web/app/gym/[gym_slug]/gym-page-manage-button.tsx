'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import LocaleLink from '@/app/components/i18n/locale-link';
import { useFeatureFlag } from '@/app/components/providers/feature-flags-provider';
import { GYM_KIOSK_FLAG } from '@/app/flags';

/**
 * Client island: the "Manage gym" entry on the public gym page. The server only
 * renders this for viewers who can edit the gym; the kiosk flag gates it further
 * so the manage surface stays hidden until the feature ships broadly.
 */
export default function GymPageManageButton({ gymSlug }: { gymSlug: string }) {
  const { t } = useTranslation('kiosk');
  const kioskFlag = useFeatureFlag(GYM_KIOSK_FLAG);
  if (!kioskFlag) {
    return null;
  }
  return (
    <Button
      component={LocaleLink}
      href={`/gym/${gymSlug}/manage`}
      variant="outlined"
      startIcon={<SettingsOutlined />}
      sx={{ textTransform: 'none' }}
    >
      {t('gymPage.manageGym')}
    </Button>
  );
}
