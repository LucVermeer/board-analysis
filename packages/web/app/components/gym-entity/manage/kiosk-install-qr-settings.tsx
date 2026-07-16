'use client';

// Install-QR setting for the kiosk editor: a single on/off switch. When on,
// every board on the kiosk renders its own "install Boardsesh" QR that
// deep-links to that board, so climbers on the wall can get the app and feed
// the screen with their sends. Independent of board count and the leaderboard
// rail — the QR is per-board, not per-kiosk-slot.

import React from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';

type KioskInstallQrSettingsProps = {
  showInstallQr: boolean;
  onToggle: (enabled: boolean) => void;
};

export default function KioskInstallQrSettings({ showInstallQr, onToggle }: KioskInstallQrSettingsProps) {
  const { t } = useTranslation('kiosk');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <FormControlLabel
        control={<Switch checked={showInstallQr} onChange={(event) => onToggle(event.target.checked)} />}
        label={t('manage.editor.installQrSwitch')}
      />
      <FormHelperText>{t('manage.editor.installQrHelper')}</FormHelperText>
    </Box>
  );
}
