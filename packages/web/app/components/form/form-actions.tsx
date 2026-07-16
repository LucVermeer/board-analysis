'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import type { SxProps, Theme } from '@mui/material/styles';

export type FormActionsLayout = 'inline' | 'stacked' | 'row';

export type FormActionsProps = {
  submitLabel: React.ReactNode;
  submitting?: boolean;
  disabled?: boolean;
  /** Renders the submit button with the error colour (destructive confirmations). */
  destructive?: boolean;
  onCancel?: () => void;
  /** Cancel button label. Defaults to the shared `common:actions.cancel` string. */
  cancelLabel?: React.ReactNode;
  /** Left-aligned content, e.g. a "Delete" or "Save draft" secondary control. */
  secondaryAction?: React.ReactNode;
  /**
   * - `inline` (default): right-aligned row on >=sm, full-width column-reverse on <sm.
   * - `stacked`: always a full-width column.
   * - `row`: always a right-aligned row.
   */
  layout?: FormActionsLayout;
  /** Associate the submit button with a form by id (submit from outside the `<form>`). */
  formId?: string;
};

/**
 * FormActions renders the cancel / submit button pair (plus an optional left-aligned
 * secondary action). The submit button keeps its label while submitting and shows a
 * `startIcon` spinner, so its width never jumps.
 */
export function FormActions({
  submitLabel,
  submitting = false,
  disabled = false,
  destructive = false,
  onCancel,
  cancelLabel,
  secondaryAction,
  layout = 'inline',
  formId,
}: FormActionsProps) {
  const { t } = useTranslation('common');
  const resolvedCancelLabel = cancelLabel ?? t('actions.cancel');

  const containerSx: SxProps<Theme> =
    layout === 'stacked'
      ? { display: 'flex', flexDirection: 'column', gap: 1.5 }
      : layout === 'row'
        ? { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5 }
        : {
            display: 'flex',
            flexDirection: { xs: 'column-reverse', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            justifyContent: { sm: 'flex-end' },
            gap: 1.5,
          };

  const buttonWidthSx: SxProps<Theme> =
    layout === 'stacked' ? { width: '100%' } : layout === 'inline' ? { width: { xs: '100%', sm: 'auto' } } : {};

  const secondaryWrapperSx: SxProps<Theme> =
    layout === 'stacked' ? { width: '100%' } : { mr: { sm: 'auto' }, display: 'flex' };

  return (
    <Box sx={containerSx}>
      {secondaryAction != null ? <Box sx={secondaryWrapperSx}>{secondaryAction}</Box> : null}
      {onCancel ? (
        <Button variant="text" onClick={onCancel} disabled={submitting} sx={buttonWidthSx}>
          {resolvedCancelLabel}
        </Button>
      ) : null}
      <Button
        type="submit"
        variant="contained"
        color={destructive ? 'error' : 'primary'}
        form={formId}
        disabled={submitting || disabled}
        startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        sx={buttonWidthSx}
      >
        {submitLabel}
      </Button>
    </Box>
  );
}
