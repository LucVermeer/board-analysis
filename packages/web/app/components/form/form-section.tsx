'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

export type FormSectionProps = {
  /** Section heading (subtitle2 · secondary). */
  title?: React.ReactNode;
  /** Supporting copy under the title (body2 · secondary). */
  description?: React.ReactNode;
  children: React.ReactNode;
  sx?: SxProps<Theme>;
};

/**
 * FormSection groups related fields under an optional heading.
 *
 * Header block spacing: 4px between title and description, 12px between the header block
 * and the fields. Fields stack in a 20px column. When neither title nor description is
 * provided the header (and its 12px gap) is omitted entirely.
 */
export function FormSection({ title, description, children, sx }: FormSectionProps) {
  const hasHeader = title != null || description != null;
  return (
    <Box sx={[{ display: 'flex', flexDirection: 'column' }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {hasHeader ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px', mb: '12px' }}>
          {title != null ? (
            <Typography variant="subtitle2" color="text.secondary">
              {title}
            </Typography>
          ) : null}
          {description != null ? (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          ) : null}
        </Box>
      ) : null}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>{children}</Box>
    </Box>
  );
}
