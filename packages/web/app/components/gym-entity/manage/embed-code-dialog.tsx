'use client';

// Embed-code dialog: a read-only iframe snippet + Copy button, for pasting a
// live board view or the gym leaderboard into any website.

import React from 'react';
import { useTranslation } from 'react-i18next';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';

export type EmbedCodeDialogState = {
  title: string;
  snippet: string;
  /** Show the leaderboard-only note about the supported period params. */
  showPeriodNote: boolean;
};

type EmbedCodeDialogProps = {
  state: EmbedCodeDialogState | null;
  onClose: () => void;
};

export default function EmbedCodeDialog({ state, onClose }: EmbedCodeDialogProps) {
  const { t } = useTranslation('kiosk');
  const { showMessage } = useSnackbar();

  const handleCopy = async () => {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(state.snippet);
      showMessage(t('embed.copied'), 'success');
    } catch {
      showMessage(t('embed.copyFailed'), 'error');
    }
  };

  return (
    <Dialog open={state !== null} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{state?.title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{t('embed.docsHint')}</DialogContentText>
        <TextField
          value={state?.snippet ?? ''}
          fullWidth
          multiline
          minRows={3}
          slotProps={{
            htmlInput: {
              readOnly: true,
              spellCheck: false,
              sx: { fontFamily: 'monospace', fontSize: '0.8125rem' },
            },
          }}
          onFocus={(event) => event.target.select()}
        />
        {state?.showPeriodNote && (
          <DialogContentText sx={{ mt: 1.5 }} variant="body2">
            {t('embed.periodNote')}
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          {t('embed.close')}
        </Button>
        <Button
          variant="contained"
          startIcon={<ContentCopyOutlined />}
          onClick={handleCopy}
          sx={{ textTransform: 'none' }}
        >
          {t('embed.copy')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
