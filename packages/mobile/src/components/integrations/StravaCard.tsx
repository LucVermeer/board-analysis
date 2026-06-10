import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { IntegrationStatus } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { Button } from '../Button';
import { ListRow } from '../ListRow';
import { SwitchRow } from '../SwitchRow';
import { useTheme } from '../../providers/theme-provider';
import { useToast } from '../../providers/toast-provider';
import { borderRadius, spacing } from '../../theme/tokens';
import { connectStrava } from '../../lib/integrations';
import { useDisconnectIntegration, useIntegrationStatuses, useSetIntegrationAutoSync } from '../../lib/graphql/hooks';

// Strava's brand orange. Their guidelines require the official "Connect with
// Strava" artwork; until we ship that asset we approximate with the brand colour
// on the repo Button.
const STRAVA_ORANGE = '#FC4C02';

function findStravaStatus(statuses: IntegrationStatus[] | undefined): IntegrationStatus | undefined {
  return statuses?.find((status) => status.provider === 'STRAVA');
}

export function StravaCard() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { systemColors, brandColors } = useTheme();
  const { showToast } = useToast();
  const { data: statuses, isLoading, refetch } = useIntegrationStatuses();
  const setAutoSync = useSetIntegrationAutoSync();
  const disconnectIntegration = useDisconnectIntegration();
  const [connecting, setConnecting] = useState(false);

  const strava = findStravaStatus(statuses);

  const handleConnect = useCallback(() => {
    setConnecting(true);
    void (async () => {
      try {
        const result = await connectStrava();
        // Refresh status regardless of outcome so the card reflects a
        // connection that landed even if the result came back ambiguous.
        await refetch();
        if (result === 'connected') {
          showToast(t('integrations.toast.connected'), 'success');
        } else if (result === 'error') {
          showToast(t('integrations.toast.connectFailed'), 'error');
        }
        // 'cancelled' is a deliberate user choice — no toast.
      } finally {
        setConnecting(false);
      }
    })();
  }, [refetch, showToast, t]);

  const handleAutoSyncChange = useCallback(
    (enabled: boolean) => {
      // The mutation hook owns the optimistic cache update.
      setAutoSync.mutate({ provider: 'STRAVA', enabled });
    },
    [setAutoSync],
  );

  const handleDisconnect = useCallback(() => {
    Alert.alert(t('integrations.strava.disconnectConfirmTitle'), t('integrations.strava.disconnectConfirmBody'), [
      { text: tCommon('actions.cancel'), style: 'cancel' },
      {
        text: t('integrations.strava.disconnect'),
        style: 'destructive',
        onPress: () => {
          disconnectIntegration.mutate(
            { provider: 'STRAVA' },
            {
              onSuccess: () => {
                showToast(t('integrations.toast.disconnected'), 'success');
              },
            },
          );
        },
      },
    ]);
  }, [disconnectIntegration, showToast, t, tCommon]);

  if (isLoading && !strava) {
    return (
      <View style={[styles.card, styles.loadingCard, { backgroundColor: systemColors.secondaryBackground }]}>
        <ActivityIndicator color={brandColors.primary} />
      </View>
    );
  }

  if (!strava?.connected) {
    return (
      <View style={[styles.card, styles.disconnectedCard, { backgroundColor: systemColors.secondaryBackground }]}>
        <Text variant="footnote" color={systemColors.secondaryLabel}>
          {t('integrations.strava.autoSyncDescription')}
        </Text>
        {/* TODO: replace with official "Connect with Strava" brand asset (Strava brand guidelines) */}
        <Button
          title={t('integrations.strava.connect')}
          variant="filled"
          tintColor={STRAVA_ORANGE}
          onPress={handleConnect}
          disabled={connecting}
          loading={connecting}
        />
      </View>
    );
  }

  const accountLabel = strava.externalAccountName
    ? t('integrations.strava.connectedAs', { name: strava.externalAccountName })
    : t('integrations.strava.connected');
  const needsReconnect = strava.status === 'expired' || strava.status === 'revoked';

  return (
    <View style={[styles.card, { backgroundColor: systemColors.secondaryBackground }]}>
      <ListRow title={accountLabel} showSeparator />
      <SwitchRow
        label={t('integrations.strava.autoSync')}
        description={t('integrations.strava.autoSyncDescription')}
        value={strava.autoSyncEnabled}
        onValueChange={handleAutoSyncChange}
      />
      {needsReconnect ? (
        <View style={styles.reconnectBlock}>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.reconnectHint}>
            {t('integrations.strava.expired')}
          </Text>
          <Button
            title={t('integrations.strava.reconnect')}
            variant="filled"
            tintColor={STRAVA_ORANGE}
            onPress={handleConnect}
            disabled={connecting}
            loading={connecting}
          />
        </View>
      ) : null}
      {/* Destructive disconnect: the repo ListRow has no destructive variant, so
          use a text Button tinted with the brand-error colour. */}
      <View style={styles.disconnectRow}>
        <Button
          title={t('integrations.strava.disconnect')}
          variant="text"
          tintColor={brandColors.error}
          icon="delete"
          onPress={handleDisconnect}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing[4],
  },
  loadingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[6],
  },
  disconnectedCard: {
    padding: spacing[4],
    gap: spacing[3],
  },
  reconnectBlock: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    gap: spacing[2],
  },
  reconnectHint: {
    paddingTop: spacing[1],
  },
  disconnectRow: {
    alignItems: 'flex-start',
    paddingHorizontal: spacing[2],
    paddingBottom: spacing[2],
  },
});
