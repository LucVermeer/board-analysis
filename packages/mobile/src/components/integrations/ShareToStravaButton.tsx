import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { useToast } from '../../providers/toast-provider';
import { useIntegrationStatuses, useSyncSessionToIntegration } from '../../lib/graphql/hooks';

type ShareToStravaButtonProps = {
  sessionId: string;
};

// Strava brand orange — same approximation as StravaCard until we ship the
// official "Share to Strava" artwork.
const STRAVA_ORANGE = '#FC4C02';

/**
 * Manual "Share to Strava" action for the session summary. Only renders when the
 * user has a connected Strava account.
 */
export function ShareToStravaButton({ sessionId }: ShareToStravaButtonProps) {
  const { t } = useTranslation('session');
  const { showToast } = useToast();
  const { data: statuses } = useIntegrationStatuses();
  const syncSession = useSyncSessionToIntegration();

  const stravaConnected = statuses?.some((status) => status.provider === 'STRAVA' && status.connected) ?? false;

  const handlePress = useCallback(() => {
    syncSession.mutate(
      { provider: 'STRAVA', sessionId },
      {
        onSuccess: (data) => {
          // A resolved mutation can still carry a domain error (e.g. Strava
          // rejected the upload); treat that like a failure so the user can retry.
          if (data.syncSessionToIntegration.error) {
            showToast(t('summary.shareToStravaFailed'), 'error');
          }
        },
        onError: () => {
          showToast(t('summary.shareToStravaFailed'), 'error');
        },
      },
    );
  }, [syncSession, sessionId, showToast, t]);

  if (!stravaConnected) return null;

  const succeeded = syncSession.isSuccess && !syncSession.data?.syncSessionToIntegration.error;

  if (syncSession.isPending) {
    return (
      <Button
        title={t('summary.sharingToStrava')}
        variant="filled"
        tintColor={STRAVA_ORANGE}
        onPress={handlePress}
        disabled
        loading
      />
    );
  }

  if (succeeded) {
    return (
      <Button
        title={t('summary.sharedToStrava')}
        variant="filled"
        tintColor={STRAVA_ORANGE}
        icon="check.small"
        onPress={handlePress}
        disabled
      />
    );
  }

  // Idle, or after a failure — allow a retry. The error toast already fired.
  return <Button title={t('summary.shareToStrava')} variant="filled" tintColor={STRAVA_ORANGE} onPress={handlePress} />;
}
