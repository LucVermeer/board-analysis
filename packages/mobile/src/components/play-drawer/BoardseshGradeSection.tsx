import { memo, useCallback, useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useBoardseshGrade } from '../../lib/graphql/hooks';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { useTheme } from '../../providers/theme-provider';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { buildBoardseshGradeView, isMoonBoard, type GradeScope } from './boardsesh-grade-utils';

type BoardseshGradeSectionProps = {
  climbUuid: string;
  boardName: string;
  angle: number;
};

// Locale-neutral math symbol shown after a provisional single grade to signal it
// may still shift by a grade. Not user-facing prose, so it stays out of i18n.
const APPROX_SYMBOL = '±';

export const BoardseshGradeSection = memo(function BoardseshGradeSection({
  climbUuid,
  boardName,
  angle,
}: BoardseshGradeSectionProps) {
  const { t } = useTranslation('climbs');
  const { gradeFormat } = useGradeFormat();
  const { brandColors } = useTheme();

  // MoonBoard has no community grade data in our feed yet, so skip the fetch.
  const moonboard = isMoonBoard(boardName);
  const {
    data: grade,
    isLoading,
    isError,
    refetch,
  } = useBoardseshGrade(boardName, climbUuid, angle, {
    enabled: !moonboard,
  });

  const view = useMemo(
    () => buildBoardseshGradeView(boardName, grade ?? null, gradeFormat),
    [boardName, grade, gradeFormat],
  );

  const scopeLabel = useCallback(
    (scope: GradeScope) =>
      scope === 'universal' ? t('boardseshGrade.universalLabel') : t('boardseshGrade.localLabel'),
    [t],
  );

  const handleRetry = useCallback(() => {
    void Haptics.selectionAsync();
    void refetch();
  }, [refetch]);

  if (!moonboard && isLoading) {
    return <View style={[styles.skeleton, styles.skeletonBlock]} />;
  }

  if (!moonboard && isError) {
    return (
      <Pressable
        onPress={handleRetry}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={t('boardseshGrade.loadError')}
      >
        <Icon name="refresh" size={20} color={brandColors.primary} />
        <Text variant="subheadline" color={brandColors.primary}>
          {t('boardseshGrade.loadError')}
        </Text>
      </Pressable>
    );
  }

  if (view.kind === 'moonboard') {
    return (
      <View style={styles.row}>
        <Icon name="info" size={20} color={iosSystemColors.systemGray} />
        <Text variant="subheadline" color={iosSystemColors.systemGray} style={styles.flexText}>
          {t('boardseshGrade.moonboardBody')}
        </Text>
      </View>
    );
  }

  if (view.kind === 'setterOnly') {
    return (
      <View style={styles.row}>
        <Icon name="flag" size={20} color={iosSystemColors.systemGray} />
        <Text variant="subheadline" color={iosSystemColors.systemGray} style={styles.flexText}>
          {t('boardseshGrade.setterOnly')}
        </Text>
      </View>
    );
  }

  if (view.kind === 'confirmed') {
    return (
      <View style={styles.gradeRow}>
        <Text variant="largeTitle" style={[styles.gradeValue, { color: view.grade.color }]}>
          {view.grade.label}
        </Text>
        <View style={styles.gradeMeta}>
          <View style={styles.scopeRow}>
            <Icon name="checkmark.circle.fill" size={16} color={iosSystemColors.systemGreen} />
            <Text variant="subheadline">{scopeLabel(view.scope)}</Text>
          </View>
          <Text variant="footnote" color={iosSystemColors.systemGray}>
            {t('boardseshGrade.confirmedSubline', { count: view.count })}
          </Text>
          {view.scope === 'local' && (
            <Text variant="caption1" color={iosSystemColors.systemGray}>
              {t('boardseshGrade.localScopeNote')}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // Provisional: a range spanning two grades, else the single grade with a subtle ±.
  return (
    <View style={styles.gradeRow}>
      <View style={styles.provisionalValue}>
        <Text variant="largeTitle" style={[styles.gradeValue, { color: view.grade.color }]}>
          {view.rangeLabel ?? view.grade.label}
        </Text>
        {!view.rangeLabel && (
          <Text variant="callout" color={iosSystemColors.systemGray} style={styles.approx}>
            {APPROX_SYMBOL}
          </Text>
        )}
      </View>
      <View style={styles.gradeMeta}>
        <Text variant="subheadline">{scopeLabel(view.scope)}</Text>
        <Text variant="footnote" color={iosSystemColors.systemGray}>
          {t('boardseshGrade.provisionalSubline', { count: view.count })}
        </Text>
        {view.scope === 'local' && (
          <Text variant="caption1" color={iosSystemColors.systemGray}>
            {t('boardseshGrade.localScopeNote')}
          </Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  flexText: {
    flex: 1,
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  gradeValue: {
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  provisionalValue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 2,
  },
  approx: {
    marginTop: spacing[1],
  },
  gradeMeta: {
    flex: 1,
    gap: 2,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  skeleton: {
    borderRadius: borderRadius.md,
    backgroundColor: `${iosSystemColors.systemGray}14`,
  },
  skeletonBlock: {
    height: spacing[10],
  },
});
