'use client';

import React, { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Paper from '@mui/material/Paper';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import { FeedbackForm } from './feedback-form';
import { useSubmitAppFeedback } from '@/app/hooks/use-submit-app-feedback';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import { isNativeApp } from '@/app/lib/ble/capacitor-utils';
import { requestInAppReview } from '@/app/lib/in-app-review';
import { FEEDBACK_PROMPT_EVENT, setFeedbackStatus, shouldShowPrompt } from '@/app/lib/feedback-prompt-db';
import styles from './feedback-prompt-banner.module.css';

type BannerBodyProps = {
  onDismiss: () => void;
  onSubmitted: () => void;
  titleId: string;
};

const FeedbackPromptBannerBody: React.FC<BannerBodyProps> = ({ onDismiss, onSubmitted, titleId }) => {
  const { t } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const { mutateAsync } = useSubmitAppFeedback();
  const { showMessage } = useSnackbar();

  const handleSubmit = (values: { rating: number | null; comment: string | null }) => {
    if (values.rating === null) return;
    onSubmitted();
    if (values.rating >= 3 && isNativeApp()) {
      void requestInAppReview();
    }
    // mutateAsync outlives the observer; per-call options on mutate() die when Fade unmounts this body.
    mutateAsync({
      rating: values.rating,
      comment: values.comment,
      source: 'prompt',
    })
      .then(() => showMessage(tSettings('feedbackBanner.successToast'), 'success'))
      .catch(() => showMessage(tSettings('feedbackBanner.errorToast'), 'warning'));
  };

  return (
    <Paper elevation={1} className={styles.banner} role="region" aria-labelledby={titleId}>
      <IconButton
        aria-label={tSettings('feedbackBanner.dismissAria')}
        onClick={onDismiss}
        className={styles.closeButton}
        size="small"
      >
        <CloseOutlined fontSize="small" />
      </IconButton>
      <FeedbackForm
        mode="prompt"
        title={t('feedback.title')}
        submitLabel={tSettings('feedbackForm.saveDefault')}
        onSubmit={handleSubmit}
        titleId={titleId}
      />
    </Paper>
  );
};

export const FeedbackPromptBanner: React.FC = () => {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    let cancelled = false;
    void shouldShowPrompt().then((should) => {
      if (!cancelled && should) setOpen(true);
    });
    const listener = () => setOpen(true);
    window.addEventListener(FEEDBACK_PROMPT_EVENT, listener);
    return () => {
      cancelled = true;
      window.removeEventListener(FEEDBACK_PROMPT_EVENT, listener);
    };
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    void setFeedbackStatus('dismissed');
  }, []);

  const submitted = useCallback(() => {
    setOpen(false);
    void setFeedbackStatus('submitted');
  }, []);

  // mountOnEnter defers the body (and its hooks) until the banner first
  // becomes visible — important because this banner is rendered at the app
  // root, and the body's hooks require QueryClient/Session providers that
  // may not exist in all test harnesses.
  return (
    <Fade in={open} mountOnEnter unmountOnExit>
      <div>
        <FeedbackPromptBannerBody onDismiss={dismiss} onSubmitted={submitted} titleId={titleId} />
      </div>
    </Fade>
  );
};
