import { useCallback } from 'react';
import { View, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { Text } from '../Text';
import { hapticSelection } from '../../lib/haptics';
import { useTheme } from '../../providers/theme-provider';

export type YouTab<K extends string> = { key: K; label: string };

type YouTabBarProps<K extends string> = {
  tabs: YouTab<K>[];
  activeIndex: number;
  /** Tab position that drives the sliding underline. */
  scrollPosition: SharedValue<number>;
  onTabPress: (index: number) => void;
};

/**
 * Profile top tab bar. The underline indicator tracks a reanimated shared value
 * so it can glide between selected sections while labels update from state.
 */
export function YouTabBar<K extends string>({ tabs, activeIndex, scrollPosition, onTabPress }: YouTabBarProps<K>) {
  const { systemColors, brandColors } = useTheme();
  // Tab width lives on the UI thread so the indicator worklet always reads the
  // live value. A JS-thread useState captured in the worklet would go stale
  // after a resize / orientation change — the worklet wouldn't see the new width.
  const tabWidth = useSharedValue(0);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      tabWidth.value = event.nativeEvent.layout.width / tabs.length;
    },
    [tabWidth, tabs.length],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    width: tabWidth.value,
    transform: [{ translateX: scrollPosition.value * tabWidth.value }],
  }));

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: systemColors.background, borderBottomColor: systemColors.separator },
      ]}
      onLayout={onLayout}
      accessibilityRole="tablist"
    >
      {tabs.map((tab, index) => {
        const selected = index === activeIndex;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              hapticSelection();
              onTabPress(index);
            }}
          >
            <Text
              variant="subheadline"
              color={selected ? brandColors.primary : systemColors.secondaryLabel}
              style={selected ? styles.labelSelected : styles.label}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
      <Animated.View style={[styles.indicator, { backgroundColor: brandColors.primary }, indicatorStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  label: {
    fontWeight: '500',
  },
  labelSelected: {
    fontWeight: '700',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2.5,
    borderRadius: 2,
  },
});
