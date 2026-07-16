'use client';

// "Reinstall on TV" helper: surfaces a kiosk's public TV URL as scannable QR +
// copyable text so an owner can walk a dead screen back to life — open the URL
// in the TV's browser, or scan it with a phone to hand it over. Opened from the
// warning chip on a kiosk that's gone quiet.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LaunchOutlined from '@mui/icons-material/LaunchOutlined';
import { absoluteUrl } from '@/app/lib/seo/base-url';
import LocaleLink from '@/app/components/i18n/locale-link';
import { themeTokens } from '@/app/theme/theme-config';

type KioskTvQrDialogProps = {
  open: boolean;
  kioskName: string;
  /** The kiosk's TV path, or null when the gym still has no URL slug. */
  tvPath: string | null;
  onClose: () => void;
};

export default function KioskTvQrDialog({ open, kioskName, tvPath, onClose }: KioskTvQrDialogProps) {
  const { t } = useTranslation('kiosk');
  const tvUrl = tvPath === null ? null : absoluteUrl(tvPath);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('manage.kiosks.reinstall.title')}</DialogTitle>
      <DialogContent>
        {tvUrl === null ? (
          <Typography variant="body2" color="text.secondary">
            {t('manage.kiosks.reinstall.noUrl')}
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              {t('manage.kiosks.reinstall.body', { name: kioskName })}
            </Typography>
            {/* A QR needs a light quiet zone to scan — always render black modules
                on a white tile regardless of the manage theme. */}
            <Box
              sx={{
                backgroundColor: themeTokens.semantic.surface,
                borderRadius: themeTokens.borderRadius.md,
                p: 2,
                lineHeight: 0,
              }}
            >
              <QRCodeSVG value={tvUrl} size={196} level="M" marginSize={1} aria-hidden />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              {t('manage.kiosks.reinstall.scanHint')}
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-all', textAlign: 'center' }}>
              {tvUrl}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {tvPath !== null && (
          <Button
            component={LocaleLink}
            href={tvPath}
            target="_blank"
            rel="noopener"
            startIcon={<LaunchOutlined />}
            sx={{ textTransform: 'none' }}
          >
            {t('manage.kiosks.reinstall.openTv')}
          </Button>
        )}
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          {t('manage.kiosks.reinstall.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
