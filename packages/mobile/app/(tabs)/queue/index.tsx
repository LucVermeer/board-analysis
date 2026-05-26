import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueue } from '../../../src/providers/queue-provider';
import { useOptionalBluetoothContext } from '../../../src/providers/bluetooth-provider';
import { QueueItemRow } from '../../../src/components/QueueItemRow';
import { ConnectionBanner } from '../../../src/components/ble/ConnectionBanner';
import { Text } from '../../../src/components/Text';
import { Icon } from '../../../src/components/Icon';
import { Button } from '../../../src/components/Button';
import {
  BAR_CONTENT_HEIGHT,
  TAB_BAR_HEIGHT,
} from '../../../src/components/queue-control/persistent-queue-bar';
import { useTheme } from '../../../src/providers/theme-provider';
import type { ClimbQueueItem } from '@boardsesh/queue';

export default function QueueScreen() {
  const { state, sessionId, removeFromQueue, setCurrentClimb } = useQueue();
  const { systemColors, brandColors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation('session');
  const insets = useSafeAreaInsets();

  // Clear the persistent queue bar + tab bar + home-indicator inset.
  // Derived from the constants exported by PersistentQueueBar so devices
  // with a non-zero bottom inset (iPhone 14, etc.) don't clip the last row.
  const listBottomPadding = BAR_CONTENT_HEIGHT + TAB_BAR_HEIGHT + insets.bottom;

  const bluetooth = useOptionalBluetoothContext();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Banner shows on unexpected disconnect, hides on dismiss. bannerDismissed
  // resets implicitly when the user reconnects (connect flips
  // disconnectedUnexpectedly to false, so showConnectionBanner is false
  // regardless of bannerDismissed).
  const showConnectionBanner = !!bluetooth?.disconnectedUnexpectedly && !bannerDismissed;

  const handleReconnect = useCallback(() => {
    if (!bluetooth) return;
    setBannerDismissed(false);
    void bluetooth.connect();
  }, [bluetooth]);

  const handleDismissBanner = useCallback(() => {
    setBannerDismissed(true);
  }, []);

  const { queue, currentClimbQueueItem } = state;

  const currentClimbUuid = useMemo(() => currentClimbQueueItem?.uuid, [currentClimbQueueItem]);

  const handleItemPress = useCallback(
    (item: ClimbQueueItem) => {
      setCurrentClimb(item);
    },
    [setCurrentClimb],
  );

  const handleItemRemove = useCallback(
    (uuid: string) => {
      removeFromQueue(uuid);
    },
    [removeFromQueue],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ClimbQueueItem; index: number }) => {
      const isActive = currentClimbUuid === item.uuid;
      return (
        <QueueItemRow
          item={item}
          position={index + 1}
          isCurrentClimb={isActive}
          onPress={handleItemPress}
          onRemove={handleItemRemove}
        />
      );
    },
    [currentClimbUuid, handleItemPress, handleItemRemove],
  );

  const keyExtractor = useCallback((item: ClimbQueueItem) => item.uuid, []);

  if (!sessionId) {
    return (
      <View style={styles.emptyContainer}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.emptyContent}>
          <Icon name="people" size={48} color={systemColors.secondaryLabel} />
          <Text variant="title3" color={systemColors.label} style={styles.emptyTitle}>
            {t('mobile.queue.noSessionTitle')}
          </Text>
          <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.emptySubtitle}>
            {t('mobile.queue.noSessionSubtitle')}
          </Text>
        </Animated.View>
      </View>
    );
  }

  if (queue.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.emptyContent}>
          <Icon name="queue" size={48} color={systemColors.secondaryLabel} />
          <Text variant="title3" color={systemColors.label} style={styles.emptyTitle}>
            {t('mobile.queue.emptyTitle')}
          </Text>
          <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.emptySubtitle}>
            {t('mobile.queue.emptySubtitle')}
          </Text>
          <Button
            title={t('mobile.queue.browseClimbs')}
            variant="filled"
            size="medium"
            icon="search"
            onPress={() => {
              router.navigate('/(tabs)/climbs');
            }}
            style={styles.browseButton}
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {bluetooth && (
        <ConnectionBanner
          visible={showConnectionBanner}
          onReconnect={handleReconnect}
          onDismiss={handleDismissBanner}
        />
      )}

      <FlashList
        data={queue}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              // Pull-to-refresh as resync trigger — the WS subscription emits a
              // FullSync on reconnect, so explicit resync isn't needed here yet.
            }}
            tintColor={brandColors.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: listBottomPadding }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyContent: {
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    textAlign: 'center',
    marginTop: 8,
  },
  emptySubtitle: {
    textAlign: 'center',
    lineHeight: 20,
  },
  browseButton: {
    marginTop: 16,
  },
});
