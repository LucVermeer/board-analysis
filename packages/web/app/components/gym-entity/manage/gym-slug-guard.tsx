'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useEntityMutation } from '@/app/hooks/use-entity-mutation';
import {
  UPDATE_GYM,
  type UpdateGymMutationVariables,
  type UpdateGymMutationResponse,
} from '@boardsesh/graphql/operations';
import type { Gym } from '@boardsesh/shared-schema';
import { sanitizeSlugInput, gymSlugValidationError, GYM_SLUG_MAX_LENGTH } from './slug-utils';

type GymSlugGuardProps = {
  gym: Gym;
  /** Called with the updated gym once a slug is saved. */
  onSlugSet: (gym: Gym) => void;
};

/**
 * Prominent banner shown in the manage shell when a gym has no URL slug. Kiosk
 * and public gym pages are keyed on the slug, so nothing is reachable until one
 * is set. Slug format is validated client-side; uniqueness is enforced by
 * updateGym, whose conflict message the mutation surfaces verbatim.
 */
export default function GymSlugGuard({ gym, onSlugSet }: GymSlugGuardProps) {
  const { t } = useTranslation('kiosk');
  const [slug, setSlug] = useState('');
  const [validationError, setValidationError] = useState<'empty' | 'invalid' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { execute } = useEntityMutation<UpdateGymMutationResponse, UpdateGymMutationVariables>(UPDATE_GYM, {
    successMessage: t('manage.slugGuard.saved'),
    errorMessage: t('manage.slugGuard.saveFailed'),
  });

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const error = gymSlugValidationError(slug);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setIsSaving(true);
    try {
      const data = await execute({ input: { gymUuid: gym.uuid, slug: slug.trim() } });
      if (data) {
        onSlugSet(data.updateGym);
      }
    } finally {
      setIsSaving(false);
    }
  };

  let helperText = t('manage.slugGuard.helper', { slug: slug || '…' });
  if (validationError === 'empty') {
    helperText = t('manage.slugGuard.errorEmpty');
  } else if (validationError === 'invalid') {
    helperText = t('manage.slugGuard.errorInvalid');
  }

  return (
    <Alert severity="warning" sx={{ mb: 3 }}>
      <AlertTitle>{t('manage.slugGuard.title')}</AlertTitle>
      {t('manage.slugGuard.body')}
      <Box
        component="form"
        onSubmit={handleSave}
        sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 1.5, flexWrap: 'wrap' }}
      >
        <TextField
          label={t('manage.slugGuard.label')}
          value={slug}
          onChange={(event) => {
            setSlug(sanitizeSlugInput(event.target.value));
            setValidationError(null);
          }}
          size="small"
          placeholder={t('manage.slugGuard.placeholder')}
          helperText={helperText}
          error={validationError !== null}
          slotProps={{ htmlInput: { maxLength: GYM_SLUG_MAX_LENGTH } }}
          sx={{ minWidth: 240 }}
        />
        <Button type="submit" variant="contained" disabled={isSaving} sx={{ mt: 0.25, textTransform: 'none' }}>
          {isSaving ? <CircularProgress size={20} color="inherit" /> : t('manage.slugGuard.save')}
        </Button>
      </Box>
    </Alert>
  );
}
