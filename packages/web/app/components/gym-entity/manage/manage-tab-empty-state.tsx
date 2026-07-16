'use client';

import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { themeTokens } from '@/app/theme/theme-config';

type ManageTabEmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  body: string;
  /** Disabled CTA hinting at the feature that lands in a later PR. */
  ctaLabel: string;
};

/**
 * Shared empty-state for the manage-gym placeholder tabs. Icon + one line of
 * copy + a disabled affordance, per the shell contract PR I fills in.
 */
export default function ManageTabEmptyState({ icon, title, body, ctaLabel }: ManageTabEmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 1.5,
        py: 6,
        px: 2,
        maxWidth: 440,
        mx: 'auto',
      }}
    >
      <Box sx={{ color: themeTokens.neutral[400], display: 'flex' }}>{icon}</Box>
      <Typography variant="h6" sx={{ fontWeight: themeTokens.typography.fontWeight.bold }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
      <Button variant="outlined" size="small" disabled sx={{ textTransform: 'none', mt: 1 }}>
        {ctaLabel}
      </Button>
    </Box>
  );
}
