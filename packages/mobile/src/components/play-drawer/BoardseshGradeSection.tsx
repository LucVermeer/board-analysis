import { memo, useCallback, useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { DifficultyByAngleChart } from './DifficultyByAngleChart';
import { useBoardseshGrade, useBoardseshGradesForAngles } from '../../lib/graphql/hooks';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { useTheme } from '../../providers/theme-provider';
import { formatRelativeTime } from '../../lib/format-relative-time';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing, borderRadius } from '../../theme/tokens';
import {
  buildBoardseshGradeView,
  buildBoardseshAngleGradeBars,
  isMoonBoard,
  APPROX_SYMBOL,
  type GradeScope,
} from './boardsesh-grade-utils';

type BoardseshGradeSectionProps = {
  climbUuid: string;
  boardName: string;
  angle: number;
};

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

  // Independent of the singular query above: an angle that's still setter-only
  // can still show a fuller Boardsesh picture at the climb's other angles.
  // Progressive enhancement — loading/error here render nothing; the section's
  // own loading/error state stays owned by the singular query above.
  const { data: angleRows } = useBoardseshGradesForAngles(boardName, climbUuid, { enabled: !moonboard });
  const angleBars = useMemo(() => buildBoardseshAngleGradeBars(angleRows ?? [], gradeFormat), [angleRows, gradeFormat]);

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

  // Confirmed/provisional share the same local-grade-line + freshness +
  // explainer footer, appended below the headline that's specific to each tier.
  // Narrowed inline (not via a boolean intermediate) so TS keeps `view` as the
  // confirmed/provisional member of the union on each access.
  const computedAt = view.kind === 'confirmed' || view.kind === 'provisional' ? view.computedAt : null;
  const localSecondary = view.kind === 'confirmed' || view.kind === 'provisional' ? view.localSecondary : null;
  const showGradeFooter = view.kind === 'confirmed' || view.kind === 'provisional';

  return (
    <View style={styles.container}>
      {view.kind === 'moonboard' && (
        <View style={styles.row}>
          <Icon name="info" size={20} color={iosSystemColors.systemGray} />
          <Text variant="subheadline" color={iosSystemColors.systemGray} style={styles.flexText}>
            {t('boardseshGrade.moonboardBody')}
          </Text>
        </View>
      )}

      {view.kind === 'setterOnly' && (
        <View style={styles.row}>
          <Icon name="flag" size={20} color={iosSystemColors.systemGray} />
          <Text variant="subheadline" color={iosSystemColors.systemGray} style={styles.flexText}>
            {t('boardseshGrade.setterOnly')}
          </Text>
        </View>
      )}

      {view.kind === 'confirmed' && (
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
      )}

      {/* Provisional: a range spanning two grades, else the single grade with a subtle ±. */}
      {view.kind === 'provisional' && (
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
      )}

      {localSecondary && (
        <Text variant="caption1" color={localSecondary.color}>
          {t('boardseshGrade.localGradeLine', { grade: localSecondary.label })}
        </Text>
      )}

      {showGradeFooter && (
        <Text variant="caption1" color={iosSystemColors.systemGray}>
          {t('boardseshGrade.summary')}
        </Text>
      )}

      {computedAt && (
        <Text variant="caption2" color={iosSystemColors.systemGray}>
          {t('boardseshGrade.updated', { when: formatRelativeTime(computedAt) })}
        </Text>
      )}

      {angleBars.length >= 2 && (
        <View style={styles.histogram}>
          <Text variant="footnote" color={iosSystemColors.systemGray}>
            {t('boardseshGrade.byAngle')}
          </Text>
          <DifficultyByAngleChart
            data={angleBars}
            accessibilityLabel={t('boardseshGrade.byAngle')}
            logScaleLabel={t('boardseshGrade.logScale')}
          />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing[3],
  },
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
  histogram: {
    gap: spacing[2],
  },
  skeleton: {
    borderRadius: borderRadius.md,
    backgroundColor: `${iosSystemColors.systemGray}14`,
  },
  skeletonBlock: {
    height: spacing[10],
  },
});
