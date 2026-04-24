'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import { FeedbackForm } from './feedback-form';
import { useSubmitAppFeedback } from '@/app/hooks/use-submit-app-feedback';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import { setFeedbackStatus } from '@/app/lib/feedback-prompt-db';
import type { AppFeedbackSource } from '@boardsesh/shared-schema';
import styles from './feedback-dialog.module.css';

export type FeedbackDialogMode = 'rating' | 'bug';

export type FeedbackSubmission = {
  rating: number | null;
  comment: string | null;
};

export type FeedbackDialogSecondaryAction = {
  label: string;
  onClick: () => void;
};

type FeedbackDialogProps = {
  open: boolean;
  onClose: () => void;
  source: AppFeedbackSource;
  title?: string;
  mode?: FeedbackDialogMode;
  /**
   * Fires after the user's submission is accepted by the form and the mutation
   * has been kicked off (fire-and-forget). Used by callers that want to chain
   * a follow-up step — e.g. the drawer asking about an App Store review after
   * a rating submission. Not invoked when the form is cancelled/closed.
   */
  onSubmitted?: (submission: FeedbackSubmission) => void;
  /**
   * Optional muted action rendered below the form. Used by the shake-triggered
   * variant to expose a "Don't show this again" escape hatch.
   */
  secondaryAction?: FeedbackDialogSecondaryAction;
};

const FeedbackDialogBody: React.FC<Omit<FeedbackDialogProps, 'open'>> = ({
  onClose,
  source,
  title,
  mode = 'rating',
  onSubmitted,
  secondaryAction,
}) => {
  const { t } = useTranslation('settings');
  const { mutateAsync } = useSubmitAppFeedback();
  const { showMessage } = useSnackbar();
  const isBug = mode === 'bug';
  const resolvedTitle = title ?? (isBug ? t('feedbackDialog.titleBug') : t('feedbackDialog.titleRating'));

  const handleSubmit = (values: FeedbackSubmission) => {
    if (isBug) {
      // Bug-mode form guarantees comment length via canSubmit.
      if (!values.comment) {
        onClose();
        return;
      }
    } else {
      // Rating-mode form disables Send until a rating is picked.
      if (values.rating === null) {
        onClose();
        return;
      }
      // Suppress the automatic banner for users who manually engaged.
      void setFeedbackStatus('submitted');
    }

    // mutateAsync outlives the observer; per-call options on mutate() die with the component on onClose().
    mutateAsync({
      rating: isBug ? null : values.rating,
      comment: values.comment,
      source,
    })
      .then(() => {
        showMessage(isBug ? t('feedbackDialog.successBug') : t('feedbackDialog.successRating'), 'success');
        // Chain only on success — don't push a failed submission toward a public app store review.
        onSubmitted?.(values);
      })
      .catch(() => {
        showMessage(t('feedbackDialog.errorRating'), 'warning');
      });
    onClose();
  };

  return (
    <div className={styles.dialogBody}>
      <IconButton
        aria-label={t('feedbackDialog.closeAria')}
        onClick={onClose}
        className={styles.closeButton}
        size="small"
      >
        <CloseOutlined fontSize="small" />
      </IconButton>
      <DialogContent>
        <FeedbackForm
          mode={isBug ? 'bug' : 'drawer-feedback'}
          title={resolvedTitle}
          submitLabel={isBug ? t('feedbackDialog.submitBug') : t('feedbackDialog.submitRating')}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </DialogContent>
      {secondaryAction && (
        <DialogActions sx={{ justifyContent: 'center' }}>
          <Button variant="text" size="small" color="inherit" onClick={() => secondaryAction.onClick()}>
            {secondaryAction.label}
          </Button>
        </DialogActions>
      )}
    </div>
  );
};

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({
  open,
  onClose,
  source,
  title,
  mode,
  onSubmitted,
  secondaryAction,
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      {open && (
        <FeedbackDialogBody
          onClose={onClose}
          source={source}
          title={title}
          mode={mode}
          onSubmitted={onSubmitted}
          secondaryAction={secondaryAction}
        />
      )}
    </Dialog>
  );
};
