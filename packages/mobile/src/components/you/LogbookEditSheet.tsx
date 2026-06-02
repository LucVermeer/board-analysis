import { type RefObject, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { useUpdateTick, useDeleteTick } from '@boardsesh/board-react';
import type { AscentFeedItem } from '@boardsesh/graphql/operations';
import { getGradeTextColor } from '@boardsesh/play-view';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';
import { Button } from '../Button';
import { StarRating } from '../StarRating';
import { SegmentedControl } from '../SegmentedControl';
import { SectionHeader } from '../SectionHeader';
import { useGrades } from '../../lib/graphql/hooks';
import { gradeBadgeColor } from './profile-chart-colors';
import { hapticSuccess, hapticError } from '../../lib/haptics';
import { brandColors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';
import { useToast } from '../../providers/toast-provider';

type TickStatus = 'flash' | 'send' | 'attempt';

type LogbookEditSheetProps = {
  sheetRef: RefObject<BottomSheet | null>;
  ascent: AscentFeedItem | null;
  onClose: () => void;
};

/** Edit (status / grade / stars / tries / comment) or delete a logged ascent. */
export function LogbookEditSheet({ sheetRef, ascent, onClose }: LogbookEditSheetProps) {
  const { t } = useTranslation('you');
  const { systemColors } = useTheme();
  const { showToast } = useToast();
  const updateTick = useUpdateTick();
  const deleteTick = useDeleteTick();
  const gradesQuery = useGrades(ascent?.boardType ?? '', !!ascent);
  const grades = gradesQuery.data ?? [];

  const [status, setStatus] = useState<TickStatus>('send');
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | undefined>(undefined);
  const [attemptCount, setAttemptCount] = useState(1);
  const [comment, setComment] = useState('');

  // Re-seed the form whenever a different ascent opens the sheet.
  useEffect(() => {
    if (!ascent) return;
    setStatus(ascent.status);
    setDifficulty(ascent.difficulty);
    setQuality(ascent.quality ?? undefined);
    setAttemptCount(Math.max(1, ascent.attemptCount));
    setComment(ascent.comment ?? '');
  }, [ascent]);

  const statusOptions: { key: TickStatus; label: string }[] = [
    { key: 'flash', label: t('mobile.logbook.status.flash') },
    { key: 'send', label: t('mobile.logbook.status.send') },
    { key: 'attempt', label: t('mobile.logbook.status.attempt') },
  ];

  const save = () => {
    if (!ascent) return;
    updateTick.mutate(
      {
        uuid: ascent.uuid,
        input: { status, difficulty, quality: quality ?? null, attemptCount, comment },
      },
      {
        onSuccess: () => {
          hapticSuccess();
          sheetRef.current?.close();
        },
        onError: () => {
          hapticError();
          showToast(t('mobile.logbook.saveError'), 'error');
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!ascent) return;
    Alert.alert(t('mobile.logbook.deleteTitle'), t('mobile.logbook.deleteConfirm'), [
      { text: t('mobile.cancel'), style: 'cancel' },
      {
        text: t('mobile.logbook.delete'),
        style: 'destructive',
        onPress: () =>
          deleteTick.mutate(ascent.uuid, {
            onSuccess: () => sheetRef.current?.close(),
            onError: () => {
              hapticError();
              showToast(t('mobile.logbook.deleteError'), 'error');
            },
          }),
      },
    ]);
  };

  return (
    <Sheet
      ref={sheetRef}
      snapPoints={['75%']}
      scrollable
      onClose={onClose}
      contentContainerStyle={styles.content}
      footer={<Button title={t('mobile.logbook.save')} onPress={save} loading={updateTick.isPending} />}
    >
      <Text variant="title3" numberOfLines={1} style={styles.title}>
        {ascent?.climbName ?? t('mobile.logbook.editTitle')}
      </Text>

      <SectionHeader title={t('mobile.logbook.statusLabel')} />
      <View style={styles.field}>
        <SegmentedControl
          options={statusOptions}
          selectedKey={status}
          onSelect={setStatus}
          trackColor={systemColors.fill}
          accessibilityLabel={t('mobile.logbook.statusLabel')}
        />
      </View>

      <SectionHeader title={t('mobile.logbook.gradeLabel')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.grades}>
        {grades.map((grade) => {
          const selected = grade.difficultyId === difficulty;
          const background = selected ? gradeBadgeColor(grade.name) : systemColors.fill;
          const textColor = selected ? getGradeTextColor(gradeBadgeColor(grade.name)) : systemColors.label;
          return (
            <Pressable
              key={grade.difficultyId}
              onPress={() => setDifficulty(grade.difficultyId)}
              style={[styles.gradeChip, { backgroundColor: background }]}
            >
              <Text variant="footnote" color={textColor} style={styles.gradeChipText}>
                {grade.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <SectionHeader title={t('mobile.logbook.qualityLabel')} />
      <View style={styles.field}>
        <StarRating value={quality} onChange={setQuality} />
      </View>

      <SectionHeader title={t('mobile.logbook.triesLabel')} />
      <View style={[styles.field, styles.stepper]}>
        <Pressable
          onPress={() => setAttemptCount((current) => Math.max(1, current - 1))}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Icon name="minus.circle" size={28} color={systemColors.secondaryLabel} />
        </Pressable>
        <Text variant="title3" style={styles.stepperValue}>
          {attemptCount}
        </Text>
        <Pressable onPress={() => setAttemptCount((current) => current + 1)} hitSlop={8} accessibilityRole="button">
          <Icon name="add" size={28} color={brandColors.primary} />
        </Pressable>
      </View>

      <SectionHeader title={t('mobile.logbook.commentLabel')} />
      <View style={styles.field}>
        <BottomSheetTextInput
          style={[styles.input, { backgroundColor: systemColors.fill, color: systemColors.label as string }]}
          placeholder={t('mobile.logbook.commentPlaceholder')}
          placeholderTextColor={systemColors.tertiaryLabel as string}
          value={comment}
          onChangeText={setComment}
          multiline
        />
      </View>

      <Pressable onPress={confirmDelete} style={styles.deleteRow} accessibilityRole="button">
        <Icon name="delete" size={18} color={brandColors.error} />
        <Text variant="body" color={brandColors.error}>
          {t('mobile.logbook.delete')}
        </Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing[6] },
  title: { paddingHorizontal: spacing[4], paddingTop: spacing[2] },
  field: { paddingHorizontal: spacing[4] },
  grades: { paddingHorizontal: spacing[4], gap: spacing[2] },
  gradeChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    minWidth: 44,
    alignItems: 'center',
  },
  gradeChipText: { fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing[5] },
  stepperValue: { minWidth: 40, textAlign: 'center' },
  input: {
    minHeight: 72,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: 15,
    textAlignVertical: 'top',
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginTop: spacing[6],
    paddingVertical: spacing[3],
  },
});
