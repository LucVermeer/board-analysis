import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, ScrollView, StyleSheet, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import type { Grade } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { hapticSelection } from '../../lib/haptics';
import { spacing } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { computeFocusOffset, type ChipLayout } from './inline-grade-picker-utils';

type InlineGradePickerProps = {
  grades: Grade[];
  selectedDifficultyId: number | undefined;
  consensusDifficultyId: number | undefined;
  onSelect: (difficultyId: number | undefined) => void;
};

const APPROX_CHIP_WIDTH = 56;

export const InlineGradePicker = React.memo(function InlineGradePicker({
  grades,
  selectedDifficultyId,
  consensusDifficultyId,
  onSelect,
}: InlineGradePickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const { systemColors } = useTheme();
  // All measured chip layouts, keyed by difficultyId. We need every chip's
  // measurement (not just the focus chip's) because chip widths vary with
  // label length and the gap between chips, so a `focusChip.x` measurement
  // alone is enough for centering — but keeping the full map costs nothing
  // and means selection changes also center correctly.
  const chipLayoutsRef = useRef<Map<number, ChipLayout>>(new Map());
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  // Bumps whenever the focus chip's layout is captured. Used to re-run the
  // auto-scroll effect once the measurement we care about lands — refs
  // alone don't trigger renders, which was the original centering bug.
  const [focusLayoutTick, setFocusLayoutTick] = useState(0);
  const hasAutoScrolledRef = useRef(false);

  const focusId = selectedDifficultyId ?? consensusDifficultyId;

  const handleScrollLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportWidth(event.nativeEvent.layout.width);
  }, []);

  const handleContentSizeChange = useCallback((width: number) => {
    setContentWidth(width);
  }, []);

  // Reset auto-scroll arming when the focus target changes (e.g. parent
  // re-mounts for a new climb). Otherwise navigating from climb A to climb
  // B would keep the first scroll permanently locked in.
  useEffect(() => {
    hasAutoScrolledRef.current = false;
  }, [focusId]);

  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    if (focusId == null) return;
    if (viewportWidth === 0) return;
    // Wait until the ScrollView has measured its content. Calling scrollTo
    // before content has been laid out is a no-op — the offset gets clamped
    // to the (still zero) scrollable range.
    if (contentWidth === 0) return;
    const index = grades.findIndex((g) => g.difficultyId === focusId);
    if (index < 0) return;
    const focusChipLayout = chipLayoutsRef.current.get(focusId) ?? null;
    const targetX = computeFocusOffset({
      viewportWidth,
      chipLayout: focusChipLayout,
      index,
      approxChipWidth: APPROX_CHIP_WIDTH,
    });
    if (targetX == null) return;
    // Only lock once we've used the real focus-chip measurement. If we
    // fell back to the index*approxChipWidth approximation, leave the
    // gate open so we re-attempt when the chip's onLayout finally fires.
    if (focusChipLayout !== null) {
      hasAutoScrolledRef.current = true;
    }
    // Defer by one frame: even after onContentSizeChange, the underlying
    // native ScrollView occasionally needs a tick before scrollTo lands.
    const handle = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: targetX, animated: false });
    });
    return () => cancelAnimationFrame(handle);
  }, [viewportWidth, contentWidth, grades, focusId, focusLayoutTick]);

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
      onLayout={handleScrollLayout}
      onContentSizeChange={handleContentSizeChange}
    >
      {grades.map((grade) => {
        const isSelected = grade.difficultyId === selectedDifficultyId;
        const isConsensus = grade.difficultyId === consensusDifficultyId;

        const chipStyle: ViewStyle = {
          ...styles.chip,
          borderColor: isSelected
            ? brandColors.primary
            : isConsensus
              ? brandColors.primary + '60'
              : systemColors.separator,
          backgroundColor: isSelected ? brandColors.primary : 'transparent',
        };

        return (
          <Pressable
            key={grade.difficultyId}
            onPress={() => handlePress(grade.difficultyId)}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              chipLayoutsRef.current.set(grade.difficultyId, { x, width });
              if (grade.difficultyId === focusId) {
                // Bump version state so the auto-scroll effect re-runs with
                // the real focus-chip measurements instead of the
                // index*approxChipWidth fallback.
                setFocusLayoutTick((tick) => tick + 1);
              }
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={grade.name}
          >
            <View style={chipStyle}>
              <Text variant="footnote" color={isSelected ? iosSystemColors.white : undefined} style={styles.chipText}>
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
