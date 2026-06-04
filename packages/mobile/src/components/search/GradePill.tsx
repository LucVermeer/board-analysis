// The grade selector for the climb-list search row / bottom card: a Liquid
// Glass pill showing the active grade band, tinted with the grade's colour when
// set. Tapping opens the grade rail. Extracted from ClimbSearchControls so the
// top row (sticky-strip) and the bottom card (bottom-bar) share one component.

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Grade } from '@boardsesh/shared-schema';
import { isAnyGrade, type GradeBound } from '@boardsesh/climb-filters';
import { getGradeColor } from '@boardsesh/board-constants/grade-colors';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { GlassSurface } from '../GlassSurface';
import { PressableSurface } from '../PressableSurface';
import { useTheme } from '../../providers/theme-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { withAlpha } from '../../theme/colors';
import { glassSize } from '../../theme/layout';
import { formatGradePillLabel } from './grade-pill-label';

const PILL_RADIUS = glassSize.standard / 2;

type GradePillProps = {
  bound: GradeBound;
  grades: readonly Grade[];
  onPress: () => void;
  expanded?: boolean;
  /** Cap the pill width so the search field keeps room (top row); omit in the card. */
  maxWidth?: number;
};

export function GradePill({ bound, grades, onPress, expanded = false, maxWidth }: GradePillProps) {
  const { t } = useTranslation('climbs');
  const { systemColors, brandColors } = useTheme();
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
  const accent = accentHex ?? brandColors.primary;
  const tintColor = gradeActive ? withAlpha(accent, 0.22) : undefined;
  const fallbackColor = gradeActive ? withAlpha(accent, 0.16) : systemColors.fill;

  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      scaleTo={0.95}
      accessibilityRole="button"
      accessibilityLabel={`${t('mobile.search.grade')}, ${gradeLabel}`}
      accessibilityState={{ expanded }}
      style={[styles.pill, maxWidth != null ? { maxWidth } : null]}
    >
      <GlassSurface
        glassEffectStyle="regular"
        tintColor={tintColor}
        fallbackColor={fallbackColor}
        borderRadius={PILL_RADIUS}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.content}>
        <Text variant="subheadline" style={styles.gradeText} numberOfLines={1}>
          {gradeLabel}
        </Text>
        <Icon name="chevron.down" size={13} color={systemColors.secondaryLabel as string} />
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: glassSize.standard,
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    height: glassSize.standard,
  },
  gradeText: {
    fontWeight: '600',
    flexShrink: 1,
  },
});
