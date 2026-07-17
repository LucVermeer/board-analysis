'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import type { SxProps, Theme } from '@mui/material/styles';

export type FormShellProps = {
  /** Submit handler wired to the underlying `<form>` element. */
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  /** Error banner shown above the fields. Any truthy ReactNode renders an alert. */
  error?: React.ReactNode;
  /**
   * Content width cap. Defaults to 640px. Pass `false` to disable capping in dense /
   * dialog contexts where the surrounding container already controls width.
   */
  maxWidth?: number | false;
  children: React.ReactNode;
  sx?: SxProps<Theme>;
  id?: string;
};

/**
 * FormShell is the outer `<form>` primitive of the Velvet form kit.
 *
 * It renders `<Box component="form" noValidate>` (validation is the caller's job — see
 * `focusFirstInvalid`), stacks children in a 24px column, caps content width, and sets
 * `containerType: 'inline-size'` so nested `FormRow`s can use container queries to go
 * multi-column based on the form's own width rather than the viewport.
 */
export function FormShell({ onSubmit, error, maxWidth = 640, children, sx, id }: FormShellProps) {
  return (
    <Box
      component="form"
      noValidate
      onSubmit={onSubmit}
      id={id}
      sx={[
        {
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          width: '100%',
          maxWidth: maxWidth === false ? 'none' : maxWidth,
          mx: 'auto',
          containerType: 'inline-size',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {error ? (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      ) : null}
      {children}
    </Box>
  );
}

/**
 * Focus (and centre-scroll) the first control the browser marked invalid.
 *
 * The kit's convention is that the caller validates on submit and flags each bad field
 * with `error` (which MUI maps to `aria-invalid="true"` on the input). After a failed
 * submit, call this with the form element to send keyboard focus to the first offender.
 *
 * Returns the focused element, or `null` if nothing was invalid.
 */
export function focusFirstInvalid(formEl: HTMLElement | null | undefined): HTMLElement | null {
  if (!formEl) return null;
  const invalid = formEl.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!invalid) return null;
  invalid.focus();
  if (typeof invalid.scrollIntoView === 'function') {
    invalid.scrollIntoView({ block: 'center' });
  }
  return invalid;
}
