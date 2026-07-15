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
  ctaLabel: string;
  /** CTA action; omitted → the button renders disabled (placeholder tabs). */
  onCtaClick?: () => void;
};

/**
 * Shared empty-state for the manage-gym tabs: icon + one line of copy + a CTA.
 */
export default function ManageTabEmptyState({ icon, title, body, ctaLabel, onCtaClick }: ManageTabEmptyStateProps) {
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
      <Button
        variant={onCtaClick ? 'contained' : 'outlined'}
        size="small"
        disabled={!onCtaClick}
        onClick={onCtaClick}
        sx={{ textTransform: 'none', mt: 1 }}
      >
        {ctaLabel}
      </Button>
    </Box>
  );
}
