import { useCallback, useMemo } from 'react';
import { View, Pressable, StyleSheet, RefreshControl, useColorScheme } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useQueue } from '../../../src/providers/queue-provider';
import { QueueItemRow } from '../../../src/components/QueueItemRow';
import { Text } from '../../../src/components/Text';
import { Icon } from '../../../src/components/Icon';
import { Button } from '../../../src/components/Button';
import { brandColors } from '../../../src/theme/colors';
import { hapticSelection } from '../../../src/lib/haptics';
import type { ClimbQueueItem } from '@boardsesh/queue';

export default function QueueScreen() {
  const { state, sessionId, removeFromQueue, setCurrentClimb, nextClimb, previousClimb } = useQueue();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const textColor = isDark ? '#FFFFFF' : '#000000';
  const secondaryTextColor = isDark ? 'rgba(235, 235, 245, 0.6)' : 'rgba(60, 60, 67, 0.6)';
  const navBarBackground = isDark ? 'rgba(28, 28, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const navBarBorder = isDark ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.29)';

  const { queue, currentClimbQueueItem } = state;

  const currentClimbIndex = useMemo(() => {
    if (!currentClimbQueueItem) return -1;
    return queue.findIndex(({ uuid }) => uuid === currentClimbQueueItem.uuid);
  }, [queue, currentClimbQueueItem]);

  const hasPrevious = currentClimbIndex > 0;
  const hasNext = currentClimbIndex >= 0 && currentClimbIndex < queue.length - 1;

  const handlePrevious = useCallback(() => {
    hapticSelection();
    previousClimb();
  }, [previousClimb]);

  const handleNext = useCallback(() => {
    hapticSelection();
    nextClimb();
  }, [nextClimb]);

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
      const isActive = currentClimbQueueItem?.uuid === item.uuid;
      return (
        <QueueItemRow
          item={item}
          position={index + 1}
          isCurrentClimb={isActive}
          onPress={() => handleItemPress(item)}
          onRemove={() => handleItemRemove(item.uuid)}
        />
      );
    },
    [currentClimbQueueItem?.uuid, handleItemPress, handleItemRemove],
  );

  const keyExtractor = useCallback((item: ClimbQueueItem) => item.uuid, []);

  // No active session state
  if (!sessionId) {
    return (
      <View style={styles.emptyContainer}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.emptyContent}>
          <Icon name="people" size={48} color={secondaryTextColor} />
          <Text variant="title3" color={textColor} style={styles.emptyTitle}>
            Start a session to use the queue
          </Text>
          <Text variant="subheadline" color={secondaryTextColor} style={styles.emptySubtitle}>
            Join or create a session from the Boards tab to line up climbs with your crew.
          </Text>
        </Animated.View>
      </View>
    );
  }

  // Empty queue state
  if (queue.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.emptyContent}>
          <Icon name="queue" size={48} color={secondaryTextColor} />
          <Text variant="title3" color={textColor} style={styles.emptyTitle}>
            No climbs in the queue
          </Text>
          <Text variant="subheadline" color={secondaryTextColor} style={styles.emptySubtitle}>
            Browse climbs and add them to your queue to get started.
          </Text>
          <Button
            title="Browse climbs"
            variant="filled"
            size="medium"
            icon="search"
            onPress={() => {
              // TODO: Navigate to climbs tab
            }}
            style={styles.browseButton}
          />
        </Animated.View>
      </View>
    );
  }

  // Queue list
  return (
    <View style={styles.container}>
      <FlashList
        data={queue}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimatedItemSize={64}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              // A pull-to-refresh would trigger a full resync request.
              // The subscription will deliver a FullSync event automatically
              // when the WS reconnects. For now this is a no-op placeholder.
            }}
            tintColor={brandColors.primary}
          />
        }
        contentContainerStyle={styles.listContent}
      />

      {/* Navigation controls */}
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[
          styles.navBar,
          {
            backgroundColor: navBarBackground,
            borderTopColor: navBarBorder,
          },
        ]}
      >
        <Pressable
          onPress={handlePrevious}
          disabled={!hasPrevious}
          style={[styles.navButton, !hasPrevious && styles.navButtonDisabled]}
          hitSlop={8}
        >
          <Icon
            name="chevron.left"
            size={22}
            color={hasPrevious ? brandColors.primary : secondaryTextColor}
          />
        </Pressable>

        <View style={styles.navClimbInfo}>
          {currentClimbQueueItem ? (
            <>
              <Text
                variant="subheadline"
                numberOfLines={1}
                color={textColor}
                style={styles.navClimbName}
              >
                {currentClimbQueueItem.climb?.name ?? 'Unknown climb'}
              </Text>
              {currentClimbQueueItem.climb?.difficulty ? (
                <Text variant="caption1" color={secondaryTextColor}>
                  {currentClimbQueueItem.climb.difficulty}
                </Text>
              ) : null}
            </>
          ) : (
            <Text variant="subheadline" color={secondaryTextColor}>
              No climb selected
            </Text>
          )}
        </View>

        <Pressable
          onPress={handleNext}
          disabled={!hasNext}
          style={[styles.navButton, !hasNext && styles.navButtonDisabled]}
          hitSlop={8}
        >
          <Icon
            name="chevron.right"
            size={22}
            color={hasNext ? brandColors.primary : secondaryTextColor}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 80, // Space for the nav bar
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
  navBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 32, // Extra padding for tab bar overlap
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navClimbInfo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  navClimbName: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
