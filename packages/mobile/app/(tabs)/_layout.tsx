import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { useBluetoothConnectedStatus } from '../../src/lib/ble/bluetooth-status-store';
import { useQueue } from '../../src/providers/queue-provider';
import { QueueBottomAccessory } from '../../src/components/queue-control/QueueBottomAccessory';
import { brandColors } from '../../src/theme/colors';

/**
 * Native bottom tabs (`expo-router/unstable-native-tabs`). On iOS 26 this renders
 * the system Liquid Glass tab bar and folds into a leading home button on scroll
 * (`minimizeBehavior="onScrollDown"`). The bottom accessory now owns only the
 * current climb + tick, so its single native platter is the intended background.
 * The Climbs tab opts into the native search role, which lets iOS place search
 * in the separated bottom-right tab affordance.
 */
export default function TabLayout() {
  const { t } = useTranslation('common');
  const { t: tPlaylists } = useTranslation('playlists');
  const { t: tSession } = useTranslation('session');

  // Record-tab status cue: a badge when a board is connected over Bluetooth or a
  // session is live (the custom tab bar's green dot + blink have no native
  // equivalent under NativeTabs).
  const isBluetoothConnected = useBluetoothConnectedStatus();
  const { sessionId } = useQueue();
  const showRecordBadge = isBluetoothConnected || sessionId !== null;

  return (
    <NativeTabs minimizeBehavior="onScrollDown">
      <NativeTabs.BottomAccessory>
        <QueueBottomAccessory />
      </NativeTabs.BottomAccessory>

      <NativeTabs.Trigger name="boards">
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" md="dashboard" />
        <NativeTabs.Trigger.Label>{t('mobile.nav.boards')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="climbs" role="search">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>{t('mobile.nav.climbs')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="record">
        <NativeTabs.Trigger.Icon sf="record.circle" md="radio_button_checked" />
        <NativeTabs.Trigger.Label>{tSession('mobile.session.recordTab')}</NativeTabs.Trigger.Label>
        {showRecordBadge ? (
          <NativeTabs.Trigger.Badge selectedBackgroundColor={brandColors.success}> </NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="discover">
        <NativeTabs.Trigger.Icon sf="bookmark" md="bookmarks" />
        <NativeTabs.Trigger.Label>{tPlaylists('bottomTabBar.discover')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="account_circle" />
        <NativeTabs.Trigger.Label>{t('mobile.nav.profile')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
