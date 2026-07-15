'use client';

// Shared confirm dialog for the manage-gym surfaces (kiosk delete, branding
// reset, editor discard, board unlink) — one place for the cancel/confirm
// pattern instead of four hand-rolled copies.

import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Colour of the confirm button; destructive actions pass 'error'. */
  confirmColor?: 'primary' | 'error';
  /**
   * Which button receives focus. Destructive dialogs default focus to CANCEL
   * so a stray Enter never deletes anything.
   */
  autoFocusButton?: 'confirm' | 'cancel';
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  confirmColor = 'error',
  autoFocusButton = 'cancel',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{body}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} autoFocus={autoFocusButton === 'cancel'} sx={{ textTransform: 'none' }}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          color={confirmColor}
          autoFocus={autoFocusButton === 'confirm'}
          sx={{ textTransform: 'none' }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
