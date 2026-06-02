import { View, Pressable, StyleSheet, type ViewStyle, type ColorValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from './Text';
import { hapticSelection } from '../lib/haptics';
import { springs } from '../theme/animations';
import { brandColors } from '../theme/colors';
import { spacing } from '../theme/tokens';
import { useTheme } from '../providers/theme-provider';

type SegmentOption = {
  key: string;
  label: string;
};

type SegmentedControlProps = {
  options: SegmentOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** Text variant for segment labels. Defaults to 'subheadline'. */
  textVariant?: 'subheadline' | 'footnote';
  /** Background color for the segmented control track. */
  trackColor: ColorValue;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Segment({
  label,
  selected,
  onPress,
  textVariant,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  textVariant: 'subheadline' | 'footnote';
}) {
  const { systemColors, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, springs.snappy);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springs.snappy);
  };

  // Selected pill is a raised tile over the track — elevatedSurface reads as a
  // light pill in light mode and a lighter-than-track tile in dark mode.
  const segmentStyle: ViewStyle = {
    flex: 1,
    paddingVertical: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    ...(selected && {
      backgroundColor: systemColors.elevatedSurface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 2,
      elevation: 2,
    }),
  };

  // Maroon brand accent reads well on the light pill; on the dark pill it's too
  // low-contrast, so fall back to the high-contrast label colour there.
  const selectedTextColor = isDark ? systemColors.label : brandColors.primary;

  return (
    <AnimatedPressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[animatedStyle, segmentStyle]}
    >
      <Text
        variant={textVariant}
        color={selected ? selectedTextColor : undefined}
        style={selected ? styles.labelSelected : styles.label}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export function SegmentedControl({
  options,
  selectedKey,
  onSelect,
  textVariant = 'subheadline',
  trackColor,
}: SegmentedControlProps) {
  const containerStyle = {
    flexDirection: 'row' as const,
    backgroundColor: trackColor,
    borderRadius: 9,
    padding: 2,
  };

  return (
    <View style={containerStyle}>
      {options.map((option) => (
        <Segment
          key={option.key}
          label={option.label}
          selected={selectedKey === option.key}
          onPress={() => onSelect(option.key)}
          textVariant={textVariant}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: '500',
  },
  labelSelected: {
    fontWeight: '600',
  },
});
