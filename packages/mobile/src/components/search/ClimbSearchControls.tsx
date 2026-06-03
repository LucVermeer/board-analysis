// The shared control row used by both search layouts (bottom bar + sticky
// strip): the grade pill (primary), the live result count, and the filters
// gear with an active-count badge. Layout-agnostic — the wrappers position it.

import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Grade } from '@boardsesh/shared-schema';
import { isAnyGrade, type GradeBound } from '@boardsesh/climb-filters';
import { getGradeColor } from '@boardsesh/board-constants/grade-colors';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { spacing } from '../../theme/tokens';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { formatGradePillLabel } from './grade-pill-label';

type ClimbSearchControlsProps = {
  bound: GradeBound;
  grades: readonly Grade[];
  /** Result count for the active filter set; undefined while loading. */
  count: number | undefined;
  activeFilterCount: number;
  onOpenGrade: () => void;
  onOpenFilters: () => void;
};

function tintFromHex(hexColor: string | undefined): string | undefined {
  if (hexColor && /^#[0-9a-fA-F]{6}$/.test(hexColor)) return `${hexColor}24`;
  return undefined;
}

export function ClimbSearchControls({
  bound,
  grades,
  count,
  activeFilterCount,
  onOpenGrade,
  onOpenFilters,
}: ClimbSearchControlsProps) {
  const { t } = useTranslation('climbs');
  const { systemColors } = useTheme();
  const { formatGrade } = useGradeFormat();

  const gradeLabel = useMemo(
    () => formatGradePillLabel(bound, grades, formatGrade, t),
    [bound, grades, formatGrade, t],
  );

  const accentHex = useMemo(() => {
    const id = bound.minGradeId ?? bound.maxGradeId;
    if (id == null) return undefined;
    const grade = grades.find((entry) => entry.difficultyId === id);
    return grade ? (getGradeColor(grade.name) ?? undefined) : undefined;
  }, [bound, grades]);

  const gradeActive = !isAnyGrade(bound);
  const pillBackground = gradeActive ? (tintFromHex(accentHex) ?? systemColors.fill) : systemColors.fill;
  const pillBorder = gradeActive ? (accentHex ?? brandColors.primary) : iosSystemColors.separator;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onOpenGrade}
        accessibilityRole="button"
        accessibilityLabel={`${t('mobile.search.grade')}, ${gradeLabel}`}
        style={[styles.gradePill, { backgroundColor: pillBackground as string, borderColor: pillBorder }]}
      >
        {gradeActive && accentHex ? <View style={[styles.gradeDot, { backgroundColor: accentHex }]} /> : null}
        <Text variant="subheadline" style={styles.gradeText} numberOfLines={1}>
          {gradeLabel}
        </Text>
        <Icon name="chevron.down" size={13} color={systemColors.secondaryLabel as string} />
      </Pressable>

      <View style={styles.spacer}>
        {count != null ? (
          <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1}>
            {t('mobile.search.climbsCount', { count })}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={onOpenFilters}
        accessibilityRole="button"
        accessibilityLabel={
          activeFilterCount > 0 ? `${t('mobile.search.filters')}, ${activeFilterCount}` : t('mobile.search.filters')
        }
        hitSlop={8}
        style={styles.gearButton}
      >
        <Icon
          name="filter"
          size={22}
          color={activeFilterCount > 0 ? brandColors.primary : (systemColors.secondaryLabel as string)}
        />
        {activeFilterCount > 0 ? (
          <View style={styles.badge}>
            <Text variant="caption2" color={iosSystemColors.white} style={styles.badgeText}>
              {activeFilterCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  gradePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: '60%',
  },
  gradeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gradeText: {
    fontWeight: '600',
    flexShrink: 1,
  },
  spacer: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  gearButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: brandColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 14,
  },
});
