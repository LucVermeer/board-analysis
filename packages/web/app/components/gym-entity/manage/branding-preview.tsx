'use client';

// Live branding preview: a dark kiosk-surface swatch showing the logo, gym
// name, and a sample accent chip — driven through resolveKioskBrand, i.e. the
// REAL contrast clamp the kiosk applies. What this card shows is what the TV
// shows, including the non-removable "Powered by Boardsesh" mark.

import React from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { KIOSK_DARK_SURFACE, resolveKioskBrand } from '@/app/lib/kiosk/brand-contrast';
import { isValidHexColor } from './color-field';
import { themeTokens } from '@/app/theme/theme-config';

const BRAND_NAME = 'Boardsesh';

// Kiosk dark-surface palette, mirroring the literals in
// kiosk-theme-scope.module.css (--kiosk-text / muted / raised). The preview
// deliberately does NOT follow the manage page's MUI theme: it shows the TV
// surface, which is always dark regardless of the viewer's colour mode.
const KIOSK_TEXT = '#f9fafb';
const KIOSK_TEXT_FADED = 'rgba(249, 250, 251, 0.65)';
const KIOSK_BADGE_BACKGROUND = 'rgba(255, 255, 255, 0.08)';

type BrandingPreviewProps = {
  gymName: string;
  /** Display-resolved logo URL (absolute), or null when the gym has no logo. */
  logoDisplayUrl: string | null;
  /** Current (possibly unsaved) field values — '' or partial input means unset. */
  primaryColor: string;
  accentColor: string;
};

export default function BrandingPreview({ gymName, logoDisplayUrl, primaryColor, accentColor }: BrandingPreviewProps) {
  const { t } = useTranslation('kiosk');

  // Same preference order as the kiosk: accent, then primary, then the
  // Boardsesh default — each clamped to ≥3:1 against the dark surface.
  const brand = resolveKioskBrand({
    brandAccentColor: isValidHexColor(accentColor) ? accentColor : null,
    brandPrimaryColor: isValidHexColor(primaryColor) ? primaryColor : null,
  });

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{
          backgroundColor: KIOSK_DARK_SURFACE,
          color: KIOSK_TEXT,
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          {logoDisplayUrl && (
            <Box
              component="img"
              src={logoDisplayUrl}
              alt=""
              sx={{ width: 40, height: 40, objectFit: 'contain', borderRadius: `${themeTokens.borderRadius.sm}px` }}
            />
          )}
          <Typography
            component="span"
            sx={{ fontWeight: themeTokens.typography.fontWeight.bold, fontSize: '1.25rem', color: KIOSK_TEXT }}
            noWrap
          >
            {gymName}
          </Typography>
        </Box>

        <Box>
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              backgroundColor: brand.accent,
              color: brand.onAccent,
              borderRadius: '999px',
              px: 1.5,
              py: 0.5,
              fontSize: '0.8125rem',
              fontWeight: themeTokens.typography.fontWeight.semibold,
            }}
          >
            {t('branding.preview.sampleChip')}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Box
            component="span"
            sx={{
              fontSize: '0.75rem',
              color: KIOSK_TEXT_FADED,
              backgroundColor: KIOSK_BADGE_BACKGROUND,
              borderRadius: '999px',
              px: 1.5,
              py: 0.5,
              whiteSpace: 'nowrap',
            }}
          >
            {t('attribution.poweredBy')}{' '}
            <Box component="span" sx={{ color: KIOSK_TEXT, fontWeight: themeTokens.typography.fontWeight.semibold }}>
              {BRAND_NAME}
            </Box>
          </Box>
        </Box>
      </Paper>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {t('branding.preview.poweredByNote')}
      </Typography>
    </Box>
  );
}
