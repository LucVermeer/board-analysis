'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import PaletteOutlined from '@mui/icons-material/PaletteOutlined';
import ManageTabEmptyState from './manage-tab-empty-state';
import type { GymManageTabProps } from './tab-props';

/**
 * Placeholder for the Branding tab. PR I replaces this body with the logo
 * uploader + colour fields; the shell keeps passing {@link GymManageTabProps},
 * so nothing above this component changes.
 */
export default function BrandingTab(_props: GymManageTabProps) {
  const { t } = useTranslation('kiosk');
  return (
    <ManageTabEmptyState
      icon={<PaletteOutlined sx={{ fontSize: 40 }} />}
      title={t('manage.branding.emptyTitle')}
      body={t('manage.branding.emptyBody')}
      ctaLabel={t('manage.branding.cta')}
    />
  );
}
