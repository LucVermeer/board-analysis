'use client';

import React, { useEffect, useRef } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import FavoriteOutlined from '@mui/icons-material/FavoriteOutlined';
import { useTranslation } from 'react-i18next';
import type { SessionSummary } from '@boardsesh/shared-schema';
import SessionSummaryView from './session-summary-view';
import { useHealthKitSync, useHealthKitAutoSync } from '@/app/hooks/use-healthkit-sync';

type SessionSummaryDialogProps = {
  summary: SessionSummary | null;
  boardType?: string;
  existingWorkoutId?: string | null;
  /** When true, the session was auto-finished after inactivity. Hides HealthKit save and changes the title. */
  autoFinished?: boolean;
  onDismiss: () => void;
};

export default function SessionSummaryDialog({
  summary,
  boardType = '',
  existingWorkoutId,
  autoFinished = false,
  onDismiss,
}: SessionSummaryDialogProps) {
  const { t } = useTranslation('session');
  const { available, state, save } = useHealthKitSync({ summary, boardType, existingWorkoutId });
  const { enabled: autoSyncEnabled, loaded: autoSyncLoaded } = useHealthKitAutoSync();
  const autoSyncedFor = useRef<string | null>(null);

  // Auto-sync on first dialog open for a given session. Skipped when the
  // session was auto-finished — the user didn't intend to end it here, so we
  // shouldn't write anything to HealthKit on their behalf.
  useEffect(() => {
    if (autoFinished) return;
    if (!summary || !available || !autoSyncLoaded) return;
    if (!autoSyncEnabled) return;
    if (autoSyncedFor.current === summary.sessionId) return;
    autoSyncedFor.current = summary.sessionId;
    void save();
  }, [summary, available, autoSyncEnabled, autoSyncLoaded, save, autoFinished]);

  let buttonLabel = t('summary.saveToAppleHealth');
  if (state === 'saving') {
    buttonLabel = t('summary.savingToAppleHealth');
  } else if (state === 'saved') {
    buttonLabel = t('summary.savedToAppleHealth');
  } else if (state === 'error') {
    buttonLabel = t('summary.saveToAppleHealthRetry');
  }

  const dialogTitle = autoFinished ? t('summary.autoFinishedDialogTitle') : t('summary.dialogTitle');

  return (
    <Dialog open={summary !== null} onClose={onDismiss} maxWidth="sm" fullWidth>
      <DialogTitle>{dialogTitle}</DialogTitle>
      <DialogContent>{summary && <SessionSummaryView summary={summary} />}</DialogContent>
      <DialogActions>
        {available && !autoFinished && (
          <Button
            onClick={() => void save()}
            variant="outlined"
            startIcon={<FavoriteOutlined />}
            disabled={state === 'saving' || state === 'saved'}
          >
            {buttonLabel}
          </Button>
        )}
        <Button onClick={onDismiss} variant="contained">
          {t('summary.done')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
