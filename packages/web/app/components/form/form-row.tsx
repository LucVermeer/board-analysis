'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

export type FormRowProps = {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
};

/**
 * FormRow lays its children out side by side once there's room.
 *
 * It's a single-column grid by default; at a container width of 440px (the form's own
 * width via `FormShell`'s `containerType: 'inline-size'`, not the viewport) it becomes an
 * N-column grid where N is the child count. Container queries — rather than viewport
 * breakpoints — keep rows sensible inside narrow surfaces like dialogs and drawers.
 */
export function FormRow({ children, sx }: FormRowProps) {
  const columnCount = React.Children.count(children);
  return (
    <Box
      sx={[
        {
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 2,
          alignItems: 'flex-start',
          '@container (min-width: 440px)': {
            gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
