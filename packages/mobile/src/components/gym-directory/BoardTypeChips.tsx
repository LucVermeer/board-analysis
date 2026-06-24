import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_BOARDS, formatBoardDisplayName } from '@boardsesh/board-config';
import type { BoardName } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { spacing } from '../../theme/tokens';
import { springs } from '../../theme/animations';
import { hapticSelection } from '../../lib/haptics';
import { useTheme } from '../../providers/theme-provider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Chip({
  boardType,
  active,
  onToggle,
}: {
  boardType: BoardName;
  active: boolean;
  onToggle: (boardType: BoardName) => void;
}) {
  const { brandColors, systemColors } = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // Brand product names — never translated.
  const label = formatBoardDisplayName(boardType);

  const handlePress = useCallback(() => {
    hapticSelection();
    onToggle(boardType);
  }, [onToggle, boardType]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.95, springs.snappy);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springs.snappy);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[
        animatedStyle,
        styles.chip,
        active
          ? { borderColor: brandColors.primary, backgroundColor: `${brandColors.primary}14` }
          : { borderColor: systemColors.separator },
      ]}
    >
      <Text variant="caption1" color={active ? brandColors.primary : undefined} style={styles.chipLabel}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export type BoardTypeChipsProps = {
  /** Currently-selected board types (multi-select OR). */
  selected: BoardName[];
  onToggle: (boardType: BoardName) => void;
  onClear: () => void;
};

/**
 * Multi-select board-type filter for the gym panel header: one chip per supported
 * board (Kilter / Tension / MoonBoard). OR semantics — tapping Kilter + Tension
 * shows gyms/boards with either. A quiet "Clear" appears once anything is active.
 * Filtering is a data-layer concern (the screen owns the selection), so it works
 * identically whether or not the map renders.
 */
export function BoardTypeChips({ selected, onToggle, onClear }: BoardTypeChipsProps) {
  const { t } = useTranslation('common');
  const { brandColors } = useTheme();
  const hasActive = selected.length > 0;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
    >
      {SUPPORTED_BOARDS.map((boardType) => (
        <Chip key={boardType} boardType={boardType} active={selected.includes(boardType)} onToggle={onToggle} />
      ))}
      {hasActive ? (
        <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button" style={styles.clear}>
          <Text variant="caption1" color={brandColors.primary} style={styles.chipLabel}>
            {t('clear')}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing[2],
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 20,
    borderWidth: 1,
  },
  chipLabel: {
    fontWeight: '500',
  },
  clear: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
});
