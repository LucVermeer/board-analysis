import React, { useCallback, useEffect, useRef } from 'react';
import { View, Pressable, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import type { Grade } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { hapticSelection } from '../../lib/haptics';
import { spacing } from '../../theme/tokens';

type InlineGradePickerProps = {
  grades: Grade[];
  selectedDifficultyId: number | undefined;
  consensusDifficultyId: number | undefined;
  onSelect: (difficultyId: number | undefined) => void;
};

export const InlineGradePicker = React.memo(function InlineGradePicker({
  grades,
  selectedDifficultyId,
  consensusDifficultyId,
  onSelect,
}: InlineGradePickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const chipWidth = 56;

  useEffect(() => {
    const focusId = selectedDifficultyId ?? consensusDifficultyId;
    if (!focusId) return;
    const index = grades.findIndex((g) => g.difficultyId === focusId);
    if (index < 0) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: Math.max(0, index * chipWidth - chipWidth * 2), animated: false });
    }, 50);
    return () => clearTimeout(timer);
    // Only scroll on mount — don't fight user's manual scrolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePress = useCallback(
    (difficultyId: number) => {
      hapticSelection();
      onSelect(selectedDifficultyId === difficultyId ? undefined : difficultyId);
    },
    [selectedDifficultyId, onSelect],
  );

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {grades.map((grade) => {
        const isSelected = grade.difficultyId === selectedDifficultyId;
        const isConsensus = grade.difficultyId === consensusDifficultyId;

        const chipStyle: ViewStyle = {
          ...styles.chip,
          borderColor: isSelected ? brandColors.primary : isConsensus ? brandColors.primary + '60' : 'rgba(60, 60, 67, 0.18)',
          backgroundColor: isSelected ? brandColors.primary : 'transparent',
        };

        return (
          <Pressable
            key={grade.difficultyId}
            onPress={() => handlePress(grade.difficultyId)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={grade.name}
          >
            <View style={chipStyle}>
              <Text
                variant="footnote"
                color={isSelected ? iosSystemColors.white : undefined}
                style={styles.chipText}
              >
                {grade.name}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontWeight: '500',
  },
});
