import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { RateLimitRetryEvent } from '@boardsesh/graphql-client';
import { useSnackbar } from '../../providers/snackbar-provider';

// A single-retry recovery is fast enough to stay silent — only surface the
// snackbar once a SECOND retry is needed (the burst is genuinely being paced).
const CATCH_UP_MIN_ATTEMPT = 2;
// Debounce so a batch of throttled adds replaying on reconnect shows one gentle
// note instead of a stack of them.
const CATCH_UP_DEBOUNCE_MS = 4000;
const CATCH_UP_SNACKBAR_DURATION_MS = 3000;

/**
 * Returns an `onRateLimited` handler that shows a debounced "catching up"
 * snackbar while queue mutations back off on `RATE_LIMITED`. Wired into the
 * queue-mutations hook so a reconnect burst (offline-reconciliation replaying
 * buffered adds) reads as pacing, not the alarming generic failure toast
 * (#2655). The mutation's optimistic local state already applied; this is
 * purely reassurance while `execute` retries.
 */
export function useRateLimitSnackbar(): (event: RateLimitRetryEvent) => void {
  const { t } = useTranslation('session');
  const { showMessage } = useSnackbar();
  const lastShownAtRef = useRef(0);

  return useCallback(
    (event: RateLimitRetryEvent) => {
      if (event.attempt < CATCH_UP_MIN_ATTEMPT) return;
      const now = Date.now();
      if (now - lastShownAtRef.current < CATCH_UP_DEBOUNCE_MS) return;
      lastShownAtRef.current = now;
      showMessage(t('queueProvider.rateLimitCatchUp'), 'info', undefined, CATCH_UP_SNACKBAR_DURATION_MS);
    },
    [t, showMessage],
  );
}
