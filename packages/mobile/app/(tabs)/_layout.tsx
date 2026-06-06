import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { useActiveBoard } from '../../src/lib/graphql/use-active-board';
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

  const { data: activeBoard, isLoading } = useActiveBoard();
  // Record-tab status cue: a badge when a board is connected over Bluetooth or a
  // session is live (the custom tab bar's green dot + blink have no native
  // equivalent under NativeTabs).
  const isBluetoothConnected = useBluetoothConnectedStatus();
  const { sessionId } = useQueue();
  const recordBadge = isBluetoothConnected || sessionId !== null ? ' ' : undefined;

  // NativeTabs has no `initialRouteName`; the first trigger (boards) is the
  // default. Existing users (a board is set) should open on Climbs — redirect
  // once on first mount. The `isLoading` guard below means `activeBoard` is
  // already resolved here, so this is a single same-frame replace, not a flash
  // of the wrong tab on every navigation.
  const didRedirect = useRef(false);
  useEffect(() => {
    if (isLoading || didRedirect.current) return;
    didRedirect.current = true;
    if (activeBoard) router.replace('/(tabs)/climbs');
  }, [isLoading, activeBoard]);

  // initialRouteName is consumed only on first mount; committing <NativeTabs>
  // before the AsyncStorage read settles would lock in the wrong default.
  if (isLoading) return null;

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
        <NativeTabs.Trigger.Badge selectedBackgroundColor={brandColors.success}>{recordBadge}</NativeTabs.Trigger.Badge>
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
