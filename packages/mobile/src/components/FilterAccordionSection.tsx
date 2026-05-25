import { type ReactNode, useEffect } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, interpolate, Easing } from 'react-native-reanimated';
import { Text } from './Text';
import { Icon } from './Icon';
import { hapticSelection } from '../lib/haptics';
import { useTheme } from '../providers/theme-provider';
import { iosSystemColors } from '../theme/ios-colors';
import { spacing } from '../theme/tokens';
import { timing } from '../theme/animations';

type FilterAccordionSectionProps = {
  label: string;
  summary?: string | null;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  disabled?: boolean;
};

export function FilterAccordionSection({
  label,
  summary,
  expanded,
  onToggle,
  children,
  disabled = false,
}: FilterAccordionSectionProps) {
  const { systemColors } = useTheme();
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: timing.normal,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, progress]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 90])}deg` }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    fontSize: interpolate(progress.value, [0, 1], [15, 17]),
    fontWeight: progress.value > 0.5 ? '600' : '500',
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const handlePress = () => {
    if (disabled) return;
    hapticSelection();
    onToggle();
  };

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityState={{ expanded, disabled }}
        accessibilityLabel={label}
        disabled={disabled}
        style={({ pressed }) => [styles.header, pressed && !disabled && styles.headerPressed]}
      >
        <Animated.View style={chevronStyle}>
          <Icon name="chevron.right" size={14} color={iosSystemColors.systemGray} />
        </Animated.View>
        <Animated.Text
          style={[styles.label, { color: systemColors.label as string }, labelStyle, disabled && styles.labelDisabled]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
        {!expanded && summary ? (
          <Text variant="footnote" style={styles.summary} numberOfLines={1}>
            {summary}
          </Text>
        ) : null}
      </Pressable>
      {expanded ? <Animated.View style={[styles.content, contentStyle]}>{children}</Animated.View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: iosSystemColors.separator,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  headerPressed: {
    opacity: 0.6,
  },
  label: {
    flex: 0,
  },
  labelDisabled: {
    opacity: 0.4,
  },
  summary: {
    flex: 1,
    textAlign: 'right',
    opacity: 0.55,
    marginLeft: spacing[2],
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
});
