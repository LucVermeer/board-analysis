'use client';

// Branding tab: gym logo + the three kiosk/embed brand colours, with a live
// preview of the dark TV surface. Colours save via an explicit Save button
// (dirty-guarded); the logo persists on upload/remove. Reset-to-defaults nulls
// all four fields after a confirm.

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined';
import { contrastRatio } from '@boardsesh/board-constants';
import {
  UPDATE_GYM,
  type UpdateGymMutationResponse,
  type UpdateGymMutationVariables,
} from '@boardsesh/graphql/operations';
import { useEntityMutation } from '@/app/hooks/use-entity-mutation';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import { getBackendHttpUrl } from '@/app/lib/backend-url';
import { KIOSK_DARK_SURFACE, KIOSK_DEFAULT_ACCENT, KIOSK_MIN_ACCENT_CONTRAST } from '@/app/lib/kiosk/brand-contrast';
import { themeTokens } from '@/app/theme/theme-config';
import { resolveGymLogoDisplayUrl } from '@/app/lib/gym-logo-display-url';
import ColorField, { isValidHexColor } from './color-field';
import GymLogoUploader from './gym-logo-uploader';
import BrandingPreview from './branding-preview';
import ConfirmDialog from './confirm-dialog';
import type { GymManageTabProps } from './tab-props';

/** '' ↔ null mapping between the text fields and the nullable gym columns. */
function fieldValueFromGym(storedColor: string | null | undefined): string {
  return storedColor ?? '';
}

function gymValueFromField(fieldValue: string): string | null {
  return fieldValue === '' ? null : fieldValue;
}

export default function BrandingTab({ gym, onGymChange, onDirtyChange }: GymManageTabProps) {
  const { t } = useTranslation('kiosk');
  const { showMessage } = useSnackbar();
  const [primaryColor, setPrimaryColor] = useState(fieldValueFromGym(gym.brandPrimaryColor));
  const [accentColor, setAccentColor] = useState(fieldValueFromGym(gym.brandAccentColor));
  const [isSavingColors, setIsSavingColors] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const updateGymMutation = useEntityMutation<UpdateGymMutationResponse, UpdateGymMutationVariables>(UPDATE_GYM, {
    errorMessage: t('branding.colors.saveFailed'),
  });

  const logoDisplayUrl = resolveGymLogoDisplayUrl(gym.logoUrl ?? null, getBackendHttpUrl());

  // brandBackgroundColor exists in the DB/SDL/zod but is deliberately NOT
  // exposed here: nothing renders it yet (the kiosk surface is always dark and
  // brand-contrast.ts ignores it; the embeds don't read it either). Add a
  // field only once a surface actually consumes the colour.
  const colorFields = [
    { key: 'primary', value: primaryColor, setValue: setPrimaryColor, label: t('branding.colors.primary') },
    { key: 'accent', value: accentColor, setValue: setAccentColor, label: t('branding.colors.accent') },
  ] as const;

  const hasInvalidColor = colorFields.some((field) => field.value !== '' && !isValidHexColor(field.value));

  const colorsDirty =
    gymValueFromField(primaryColor) !== (gym.brandPrimaryColor ?? null) ||
    gymValueFromField(accentColor) !== (gym.brandAccentColor ?? null);

  // Tell the shell about unsaved edits so tab switches and "Back to gym" get
  // the discard confirmation; report clean on unmount.
  useEffect(() => {
    onDirtyChange?.(colorsDirty);
    return () => onDirtyChange?.(false);
  }, [colorsDirty, onDirtyChange]);

  // Native confirm on page close/refresh with unsaved colours — mirrors the
  // kiosk editor's dirty guard. In-app tab switches unmount this component
  // without a hook to intercept; the inline "Unsaved changes" hint plus this
  // covers the destructive paths.
  useEffect(() => {
    if (!colorsDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chromium < 119 ignores preventDefault() and needs returnValue set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [colorsDirty]);

  // Non-blocking contrast check against the dark kiosk surface, mirroring the
  // clamp in lib/kiosk/brand-contrast.ts. Both exposed colours feed the kiosk
  // accent. Cheap enough to recompute per render — no memo.
  const lowContrastLabels = colorFields
    .filter((field) => {
      if (!isValidHexColor(field.value)) return false;
      const ratio = contrastRatio(field.value, KIOSK_DARK_SURFACE);
      return ratio !== null && ratio < KIOSK_MIN_ACCENT_CONTRAST;
    })
    .map((field) => field.label);

  const handleSaveColors = async () => {
    setIsSavingColors(true);
    try {
      const savedGymData = await updateGymMutation.execute({
        input: {
          gymUuid: gym.uuid,
          brandPrimaryColor: gymValueFromField(primaryColor),
          brandAccentColor: gymValueFromField(accentColor),
        },
      });
      if (savedGymData) {
        onGymChange(savedGymData.updateGym);
        showMessage(t('branding.colors.saved'), 'success');
      }
    } finally {
      setIsSavingColors(false);
    }
  };

  const handleReset = async () => {
    setResetDialogOpen(false);
    setIsResetting(true);
    try {
      const resetGymData = await updateGymMutation.execute({
        input: {
          gymUuid: gym.uuid,
          logoUrl: null,
          brandPrimaryColor: null,
          brandAccentColor: null,
          brandBackgroundColor: null,
        },
      });
      if (resetGymData) {
        onGymChange(resetGymData.updateGym);
        setPrimaryColor('');
        setAccentColor('');
        showMessage(t('branding.reset.done'), 'success');
      }
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: themeTokens.typography.fontWeight.bold }}>
          {t('branding.logo.heading')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('branding.logo.description')}
        </Typography>
        <GymLogoUploader gym={gym} logoDisplayUrl={logoDisplayUrl} onGymChange={onGymChange} />
      </Box>

      <Box>
        <Typography variant="h6" sx={{ fontWeight: themeTokens.typography.fontWeight.bold }}>
          {t('branding.colors.heading')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('branding.colors.description')}
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
            gap: 2,
            mb: 2,
          }}
        >
          {colorFields.map((field) => (
            <ColorField
              key={field.key}
              label={field.label}
              value={field.value}
              onChange={field.setValue}
              errorText={t('branding.colors.invalidHex')}
              fallbackColor={KIOSK_DEFAULT_ACCENT}
            />
          ))}
        </Box>

        {lowContrastLabels.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('branding.colors.contrastWarning', { colors: lowContrastLabels.join(', ') })}
          </Alert>
        )}

        <Button
          variant="contained"
          onClick={handleSaveColors}
          disabled={!colorsDirty || hasInvalidColor || isSavingColors}
          sx={{ textTransform: 'none' }}
        >
          {isSavingColors ? <CircularProgress size={20} color="inherit" /> : t('branding.colors.save')}
        </Button>
        {colorsDirty && !isSavingColors && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
            {t('branding.colors.unsavedHint')}
          </Typography>
        )}
      </Box>

      <Box>
        <Typography variant="h6" sx={{ fontWeight: themeTokens.typography.fontWeight.bold, mb: 2 }}>
          {t('branding.preview.heading')}
        </Typography>
        <BrandingPreview
          gymName={gym.name}
          logoDisplayUrl={logoDisplayUrl}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      </Box>

      <Box>
        <Button
          color="error"
          variant="text"
          startIcon={isResetting ? <CircularProgress size={16} color="inherit" /> : <RestartAltOutlined />}
          onClick={() => setResetDialogOpen(true)}
          disabled={isResetting}
          sx={{ textTransform: 'none' }}
        >
          {t('branding.reset.button')}
        </Button>
      </Box>

      <ConfirmDialog
        open={resetDialogOpen}
        title={t('branding.reset.title')}
        body={t('branding.reset.body')}
        confirmLabel={t('branding.reset.confirm')}
        cancelLabel={t('branding.reset.cancel')}
        onConfirm={handleReset}
        onClose={() => setResetDialogOpen(false)}
      />
    </Box>
  );
}
