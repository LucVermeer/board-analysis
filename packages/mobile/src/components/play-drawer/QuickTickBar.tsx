import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { createInitialTickState, deriveAscentType, getMinAttempts, clampAttempts, type TickStatus } from '@boardsesh/play-view';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { InlineStarPicker } from './InlineStarPicker';
import { InlineGradePicker } from './InlineGradePicker';
import { InlineTriesPicker } from './InlineTriesPicker';
import { useSaveTick, useGrades } from '../../lib/graphql/hooks';
import { hapticSuccess, hapticError } from '../../lib/haptics';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';
import { timing } from '../../theme/animations';

type QuickTickBarProps = {
  visible: boolean;
  climbUuid: string;
  boardName: string;
  angle: number;
  isMirror: boolean;
  isBenchmark: boolean;
  layoutId?: number;
  sizeId?: number;
  setIds?: string;
  sessionId?: string | null;
  onDismiss: () => void;
};

export const QuickTickBar = React.memo(function QuickTickBar({
  visible,
  climbUuid,
  boardName,
  angle,
  isMirror,
  isBenchmark,
  layoutId,
  sizeId,
  setIds,
  sessionId,
  onDismiss,
}: QuickTickBarProps) {
  const saveTick = useSaveTick();
  const { data: grades } = useGrades(boardName);

  const [tickState, setTickState] = useState(createInitialTickState);

  const ascentType = deriveAscentType(false, tickState.attemptCount);
  const minAttempts = useMemo(() => getMinAttempts(ascentType), [ascentType]);

  useEffect(() => {
    setTickState(createInitialTickState());
  }, [climbUuid]);

  const translateY = useSharedValue(visible ? 0 : 200);

  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : 200, { duration: timing.normal });
  }, [visible, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: translateY.value < 100 ? 1 : 0,
  }));

  const handleQualitySelect = useCallback((value: number | null) => {
    setTickState((prev) => ({ ...prev, quality: value }));
  }, []);

  const handleGradeSelect = useCallback((difficultyId: number | undefined) => {
    setTickState((prev) => ({ ...prev, difficulty: difficultyId }));
  }, []);

  const handleTriesSelect = useCallback((value: number) => {
    setTickState((prev) => ({ ...prev, attemptCount: value }));
  }, []);

  const handleSave = useCallback(() => {
    const status: TickStatus = ascentType;
    const finalAttempts = clampAttempts(tickState.attemptCount, status);

    saveTick.mutate(
      {
        input: {
          boardType: boardName,
          climbUuid,
          angle,
          isMirror,
          status,
          attemptCount: finalAttempts,
          quality: tickState.quality != null && tickState.quality > 0 ? tickState.quality : null,
          difficulty: tickState.difficulty ?? null,
          isBenchmark,
          comment: '',
          climbedAt: new Date().toISOString(),
          ...(sessionId ? { sessionId } : {}),
          ...(layoutId != null ? { layoutId } : {}),
          ...(sizeId != null ? { sizeId } : {}),
          ...(setIds ? { setIds } : {}),
        },
      },
      {
        onSuccess: () => {
          hapticSuccess();
          onDismiss();
        },
        onError: () => {
          hapticError();
        },
      },
    );
  }, [saveTick, boardName, climbUuid, angle, isMirror, isBenchmark, sessionId, layoutId, sizeId, setIds, ascentType, tickState, onDismiss]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {/* Grade row */}
      <View style={styles.row}>
        <Text variant="footnote" color={iosSystemColors.systemGray} style={styles.rowLabel}>
          Grade
        </Text>
        <View style={styles.rowPicker}>
          {grades && (
            <InlineGradePicker
              grades={grades}
              selectedDifficultyId={tickState.difficulty}
              consensusDifficultyId={undefined}
              onSelect={handleGradeSelect}
            />
          )}
        </View>
      </View>

      {/* Tries row */}
      <View style={styles.row}>
        <Text variant="footnote" color={iosSystemColors.systemGray} style={styles.rowLabel}>
          Tries
        </Text>
        <View style={styles.rowPicker}>
          <InlineTriesPicker
            attemptCount={tickState.attemptCount}
            minAttempts={minAttempts}
            onSelect={handleTriesSelect}
          />
        </View>
      </View>

      {/* Stars row */}
      <View style={styles.row}>
        <Text variant="footnote" color={iosSystemColors.systemGray} style={styles.rowLabel}>
          Stars
        </Text>
        <View style={styles.rowPicker}>
          <InlineStarPicker quality={tickState.quality} onSelect={handleQualitySelect} />
        </View>
      </View>

      {/* Save button */}
      <View style={styles.saveRow}>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.cancelButton}
        >
          <Text variant="footnote" color={iosSystemColors.systemGray}>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel={`Log ${ascentType}`}
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
        >
          <Icon name="tick.outline" size={18} color={iosSystemColors.white} />
          <Text variant="footnote" color={iosSystemColors.white} style={styles.saveLabel}>
            {ascentType === 'flash' ? 'Flash' : 'Send'}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: iosSystemColors.separator,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    zIndex: 5,
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    minHeight: 44,
  },
  rowLabel: {
    width: 48,
    fontWeight: '500',
  },
  rowPicker: {
    flex: 1,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: iosSystemColors.separator,
    marginTop: spacing[2],
  },
  cancelButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: 20,
    backgroundColor: brandColors.success,
  },
  saveButtonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  saveLabel: {
    fontWeight: '600',
  },
});
