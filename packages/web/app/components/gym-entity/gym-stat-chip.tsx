import React from 'react';
import Box from '@mui/material/Box';
import MuiTypography from '@mui/material/Typography';
import { themeTokens } from '@/app/theme/theme-config';

type GymStatChipProps = {
  icon: React.ReactNode;
  /** A count, or a placeholder (em-dash / skeleton) while it resolves. */
  value: React.ReactNode;
  label: string;
};

/**
 * Icon + count + label chip shared by the gym preview sheet (GymDetail) and the
 * public gym page. Presentational only (no directive), so it renders in the
 * server page and inside the client sheet alike.
 */
export default function GymStatChip({ icon, value, label }: GymStatChipProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ color: 'var(--neutral-400)', display: 'flex' }}>{icon}</Box>
      <MuiTypography variant="body2" sx={{ fontWeight: themeTokens.typography.fontWeight.semibold }}>
        {value}
      </MuiTypography>
      <MuiTypography variant="body2" color="text.secondary">
        {label}
      </MuiTypography>
    </Box>
  );
}
