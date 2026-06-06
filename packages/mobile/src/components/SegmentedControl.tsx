import { View, StyleSheet, type ViewStyle, type ColorValue } from 'react-native';
import { Text } from './Text';
import { PressableSurface } from './PressableSurface';
import { hapticSelection } from '../lib/haptics';
import { brandColors } from '../theme/colors';
import { spacing } from '../theme/tokens';
import { useTheme } from '../providers/theme-provider';

type SegmentOption<K extends string> = {
  key: K;
  label: string;
};

type SegmentedControlProps<K extends string> = {
  options: SegmentOption<K>[];
  selectedKey: K;
  onSelect: (key: K) => void;
  /** Text variant for segment labels. Defaults to 'subheadline'. */
  textVariant?: 'subheadline' | 'footnote';
  /** Background color for the segmented control track. */
  trackColor: ColorValue;
  /** Keys that render dimmed and non-selectable (e.g. Liquid Glass on a device that can't show it). */
  disabledKeys?: ReadonlySet<K>;
  /** Accessibility label naming the group (e.g. "Appearance"), so VoiceOver announces what the segments control. */
  accessibilityLabel?: string;
};

function Segment({
  label,
  selected,
  disabled,
  onPress,
  textVariant,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  textVariant: 'subheadline' | 'footnote';
}) {
  const { systemColors, colorScheme, opacity } = useTheme();
  const isDark = colorScheme === 'dark';

  // Selected pill is a raised tile over the track — elevatedSurface reads as a
  // light pill in light mode and a lighter-than-track tile in dark mode.
  const segmentStyle: ViewStyle = {
    flex: 1,
    paddingVertical: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    ...(disabled && { opacity: opacity.disabled }),
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
    <PressableSurface
      onPress={() => {
        if (disabled) return;
        hapticSelection();
        onPress();
      }}
      disabled={disabled}
      feedback="scale"
      scaleTo={0.95}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      style={segmentStyle}
    >
      <Text
        variant={textVariant}
        color={selected ? selectedTextColor : undefined}
        style={selected ? styles.labelSelected : styles.label}
      >
        {label}
      </Text>
    </PressableSurface>
  );
}

export function SegmentedControl<K extends string = string>({
  options,
  selectedKey,
  onSelect,
  textVariant = 'subheadline',
  trackColor,
  disabledKeys,
  accessibilityLabel,
}: SegmentedControlProps<K>) {
  const containerStyle = {
    flexDirection: 'row' as const,
    backgroundColor: trackColor,
    borderRadius: 9,
    padding: 2,
  };

  return (
    <View style={containerStyle} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => (
        <Segment
          key={option.key}
          label={option.label}
          selected={selectedKey === option.key}
          disabled={disabledKeys?.has(option.key) ?? false}
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
