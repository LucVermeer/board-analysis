'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import TvOutlined from '@mui/icons-material/TvOutlined';
import ManageTabEmptyState from './manage-tab-empty-state';
import type { GymManageTabProps } from './tab-props';

/**
 * Placeholder for the Kiosks tab. PR I replaces this body with the kiosk list +
 * editor; the shell keeps passing {@link GymManageTabProps}, so nothing above
 * this component changes.
 */
export default function KiosksTab(_props: GymManageTabProps) {
  const { t } = useTranslation('kiosk');
  return (
    <ManageTabEmptyState
      icon={<TvOutlined sx={{ fontSize: 40 }} />}
      title={t('manage.kiosks.emptyTitle')}
      body={t('manage.kiosks.emptyBody')}
      ctaLabel={t('manage.kiosks.cta')}
    />
  );
}
