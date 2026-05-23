import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Pressable, TextInput, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { Grade } from '@boardsesh/shared-schema';
import { Text } from './Text';
import { Button } from './Button';
import { Icon } from './Icon';
import { Separator } from './Separator';
import { useTheme } from '../providers/theme-provider';
import { useSaveTick, useGrades } from '../lib/graphql/hooks';
import { hapticSelection, hapticSuccess, hapticLight, hapticError } from '../lib/haptics';
import { springs } from '../theme/animations';
import { brandColors } from '../theme/colors';
import { spacing } from '../theme/tokens';

type TickStatus = 'flash' | 'send' | 'attempt';

type LogAscentSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  climbUuid: string;
  climbName: string;
  boardName: string;
  angle: number;
  isMirror: boolean;
  isBenchmark: boolean;
  layoutId?: number;
  sizeId?: number;
  setIds?: string;
  sessionId?: string | null;
};

const STATUS_OPTIONS: TickStatus[] = ['flash', 'send', 'attempt'];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SegmentOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
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

  const segmentStyle: ViewStyle = {
    flex: 1,
    paddingVertical: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    ...(selected && {
      backgroundColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 2,
      elevation: 2,
    }),
  };

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
        variant="subheadline"
        color={selected ? brandColors.primary : undefined}
        style={selected ? styles.segmentLabelSelected : styles.segmentLabel}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((starIndex) => (
        <Pressable
          key={starIndex}
          onPress={() => {
            hapticSelection();
            onChange(starIndex === value ? 0 : starIndex);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${starIndex} stars`}
          hitSlop={4}
        >
          <Icon
            name={starIndex <= value ? 'star.fill' : 'star'}
            size={28}
            color={starIndex <= value ? '#FFB800' : '#C7C7CC'}
          />
        </Pressable>
      ))}
    </View>
  );
}

function GradeChip({
  grade,
  selected,
  onPress,
}: {
  grade: Grade;
  selected: boolean;
  onPress: () => void;
}) {
  const chipStyle: ViewStyle = {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: selected ? brandColors.primary : 'rgba(60, 60, 67, 0.18)',
    backgroundColor: selected ? brandColors.primary : 'transparent',
  };

  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={grade.name}
    >
      <View style={chipStyle}>
        <Text
          variant="footnote"
          color={selected ? '#FFFFFF' : undefined}
          style={styles.gradeChipText}
        >
          {grade.name}
        </Text>
      </View>
    </Pressable>
  );
}

export function LogAscentSheet({
  visible,
  onDismiss,
  climbUuid,
  climbName,
  boardName,
  angle,
  isMirror,
  isBenchmark,
  layoutId,
  sizeId,
  setIds,
  sessionId,
}: LogAscentSheetProps) {
  const { t } = useTranslation('climbs');
  const theme = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  const saveTick = useSaveTick();
  const { data: grades } = useGrades(boardName);

  const [status, setStatus] = useState<TickStatus>('flash');
  const [attemptCount, setAttemptCount] = useState(1);
  const [quality, setQuality] = useState(0);
  const [selectedDifficultyId, setSelectedDifficultyId] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  const snapPoints = useMemo(() => ['85%'], []);

  const statusLabels: Record<TickStatus, string> = useMemo(
    () => ({
      flash: t('mobile.logAscent.flash'),
      send: t('mobile.logAscent.send'),
      attempt: t('mobile.logAscent.attempt'),
    }),
    [t],
  );

  const minAttempts = status === 'flash' ? 1 : status === 'send' ? 2 : 1;

  const handleStatusChange = useCallback(
    (newStatus: TickStatus) => {
      setStatus(newStatus);
      if (newStatus === 'flash') {
        setAttemptCount(1);
      } else if (newStatus === 'send' && attemptCount < 2) {
        setAttemptCount(2);
      }
    },
    [attemptCount],
  );

  const handleIncrement = useCallback(() => {
    hapticLight();
    setAttemptCount((previous) => previous + 1);
  }, []);

  const handleDecrement = useCallback(() => {
    hapticLight();
    setAttemptCount((previous) => Math.max(minAttempts, previous - 1));
  }, [minAttempts]);

  const resetForm = useCallback(() => {
    setStatus('flash');
    setAttemptCount(1);
    setQuality(0);
    setSelectedDifficultyId(null);
    setComment('');
  }, []);

  const handleSave = useCallback(() => {
    saveTick.mutate(
      {
        input: {
          boardType: boardName,
          climbUuid,
          angle,
          isMirror,
          status,
          attemptCount,
          quality: quality > 0 ? quality : null,
          difficulty: selectedDifficultyId,
          isBenchmark,
          comment,
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
          resetForm();
          sheetRef.current?.close();
          onDismiss();
        },
        onError: () => {
          hapticError();
        },
      },
    );
  }, [
    saveTick,
    boardName,
    climbUuid,
    angle,
    isMirror,
    status,
    attemptCount,
    quality,
    selectedDifficultyId,
    isBenchmark,
    comment,
    sessionId,
    layoutId,
    sizeId,
    setIds,
    onDismiss,
    resetForm,
  ]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const backgroundStyle: ViewStyle = {
    backgroundColor: theme.colorScheme === 'dark' ? '#1C1C1E' : '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  };

  const segmentContainerStyle: ViewStyle = {
    flexDirection: 'row',
    backgroundColor:
      theme.colorScheme === 'dark' ? 'rgba(120, 120, 128, 0.24)' : 'rgba(120, 120, 128, 0.12)',
    borderRadius: 9,
    padding: 2,
  };

  const stepperButtonStyle: ViewStyle = {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      theme.colorScheme === 'dark' ? 'rgba(120, 120, 128, 0.24)' : 'rgba(120, 120, 128, 0.12)',
  };

  const commentInputStyle = {
    borderWidth: 1,
    borderColor:
      theme.colorScheme === 'dark' ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.18)',
    borderRadius: 10,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: 16,
    lineHeight: 22,
    color: theme.colorScheme === 'dark' ? '#FFFFFF' : '#000000',
    minHeight: 80,
    textAlignVertical: 'top' as const,
  };

  if (!visible) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onChange={handleSheetChange}
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={backgroundStyle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetView style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="title3">{t('mobile.logAscent.title')}</Text>
          <Text variant="subheadline" style={styles.climbName}>
            {climbName}
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Status segmented control */}
          <View style={styles.section}>
            <View style={segmentContainerStyle}>
              {STATUS_OPTIONS.map((option) => (
                <SegmentOption
                  key={option}
                  label={statusLabels[option]}
                  selected={status === option}
                  onPress={() => handleStatusChange(option)}
                />
              ))}
            </View>
          </View>

          {/* Attempt count stepper */}
          <View style={styles.section}>
            <Text variant="subheadline" style={styles.sectionLabel}>
              {t('mobile.logAscent.attempts')}
            </Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={handleDecrement}
                disabled={attemptCount <= minAttempts}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.logAscent.decreaseAttempts')}
                style={[
                  stepperButtonStyle,
                  attemptCount <= minAttempts && styles.stepperDisabled,
                ]}
              >
                <Icon
                  name="minus.circle"
                  size={22}
                  color={attemptCount <= minAttempts ? '#C7C7CC' : brandColors.primary}
                />
              </Pressable>
              <Text variant="title3" style={styles.attemptCount}>
                {attemptCount}
              </Text>
              <Pressable
                onPress={handleIncrement}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.logAscent.increaseAttempts')}
                style={stepperButtonStyle}
              >
                <Icon name="add" size={22} color={brandColors.primary} />
              </Pressable>
            </View>
          </View>

          <Separator />

          {/* Quality rating */}
          <View style={styles.section}>
            <Text variant="subheadline" style={styles.sectionLabel}>
              {t('mobile.logAscent.quality')}
            </Text>
            <StarRating value={quality} onChange={setQuality} />
          </View>

          <Separator />

          {/* Grade opinion */}
          {grades && grades.length > 0 && (
            <>
              <View style={styles.section}>
                <Text variant="subheadline" style={styles.sectionLabel}>
                  {t('mobile.logAscent.gradeOpinion')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.gradeChipsContainer}
                >
                  {grades.map((grade) => (
                    <GradeChip
                      key={grade.difficultyId}
                      grade={grade}
                      selected={selectedDifficultyId === grade.difficultyId}
                      onPress={() =>
                        setSelectedDifficultyId(
                          selectedDifficultyId === grade.difficultyId ? null : grade.difficultyId,
                        )
                      }
                    />
                  ))}
                </ScrollView>
              </View>

              <Separator />
            </>
          )}

          {/* Comment */}
          <View style={styles.section}>
            <Text variant="subheadline" style={styles.sectionLabel}>
              {t('mobile.logAscent.comment')}
            </Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder={t('mobile.logAscent.commentPlaceholder')}
              placeholderTextColor={
                theme.colorScheme === 'dark' ? 'rgba(235, 235, 245, 0.3)' : 'rgba(60, 60, 67, 0.3)'
              }
              multiline
              style={commentInputStyle}
            />
          </View>

          {/* Save button */}
          <View style={styles.saveSection}>
            <Button
              title={t('mobile.logAscent.save')}
              onPress={handleSave}
              variant="filled"
              size="large"
              loading={saveTick.isPending}
              disabled={saveTick.isPending}
              style={styles.saveButton}
            />
          </View>
        </ScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  indicator: {
    backgroundColor: 'rgba(60, 60, 67, 0.3)',
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  content: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    alignItems: 'center',
    gap: 4,
  },
  climbName: {
    opacity: 0.6,
  },
  scrollContent: {
    paddingBottom: spacing[10],
  },
  section: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  sectionLabel: {
    opacity: 0.6,
    marginBottom: spacing[2],
  },
  segmentLabel: {
    fontWeight: '500',
  },
  segmentLabelSelected: {
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[5],
  },
  stepperDisabled: {
    opacity: 0.4,
  },
  attemptCount: {
    minWidth: 40,
    textAlign: 'center',
  },
  starRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  gradeChipsContainer: {
    gap: spacing[2],
    paddingVertical: spacing[1],
  },
  gradeChipText: {
    fontWeight: '500',
  },
  saveSection: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  saveButton: {
    width: '100%',
  },
});
