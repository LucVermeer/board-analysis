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

    // Use mutateAsync + a promise chain, not mutate() with per-call callbacks.
    // onClose() below unmounts this body synchronously, which tears down
    // React Query's MutationObserver and cancels any per-call callbacks
    // (onSuccess / onError). The underlying mutation promise survives the
    // teardown — TanStack Query does not cancel mutations when an observer
    // is removed — so a raw .then/.catch chain still runs the post-submit
    // hooks. Without this, the chained StoreReviewPromptDialog after a
    // rating submission never opened and the "Thanks — logged" snackbar
    // silently never fired.
    mutateAsync({
      rating: isBug ? null : values.rating,
      comment: values.comment,
      source,
    })
      .then(() => {
        showMessage(isBug ? t('feedbackDialog.successBug') : t('feedbackDialog.successRating'), 'success');
        // Chained follow-ups (e.g. "also leave a store review?") only on
        // successful submission — otherwise we'd be prompting the user to
        // publicly review the app right after telling them their feedback
        // didn't save.
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
