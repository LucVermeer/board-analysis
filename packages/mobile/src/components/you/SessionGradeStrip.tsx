import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SessionGradeDistributionItem } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { buildSessionGradeBars, gradeBadgeColor } from './profile-chart-colors';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { useTheme } from '../../providers/theme-provider';
import { spacing } from '../../theme/tokens';

const BAR_MAX_HEIGHT = 20;
const BAR_MIN_HEIGHT = 6;

type SessionGradeStripProps = {
  distribution: SessionGradeDistributionItem[];
  totalSends: number;
};

/**
 * Compact "grade pyramid" for a feed card: one vivid grade-coloured bar per
 * occupied grade, ordered easy→hard, bar height ∝ ascent count. It's the
 * session's grade SPREAD — the breadth signal the hero (a single climb) can't
 * show, and the thing that makes a card read as "a session". Pure Views (no
 * chart lib), always-on, non-interactive; it sits in the header→hero gap and
 * doubles as the separator. Hidden unless there are 2+ grades (a single grade
 * isn't a spread), and self-hides on an empty distribution.
 */
export const SessionGradeStrip = memo(function SessionGradeStrip({ distribution, totalSends }: SessionGradeStripProps) {
  const { systemColors } = useTheme();
  const { t } = useTranslation('feed');
  const { formatGrade } = useGradeFormat();

  // Reuse the chart builder: easy→hard order, empty grades dropped, each grade's
  // vivid colour + total already resolved. Solid bars (no splitFlash).
  const bars = useMemo(() => buildSessionGradeBars(distribution, formatGrade), [distribution, formatGrade]);

  if (!bars || bars.length < 2) return null;

  const maxCount = Math.max(...bars.map((bar) => bar.segments[0]?.value ?? 0));
  const minLabel = bars[0].label;
  const maxLabel = bars[bars.length - 1].label;

  return (
    <View
      style={styles.container}
      pointerEvents="none"
      accessibilityRole="image"
      accessibilityLabel={t('sessionFeedCard.gradeSpread', { min: minLabel, max: maxLabel, sends: totalSends })}
    >
      <View style={styles.bars}>
        {bars.map((bar) => {
          const value = bar.segments[0]?.value ?? 0;
          const color = bar.segments[0]?.color ?? gradeBadgeColor(bar.key);
          const height =
            maxCount > 0 ? Math.max(BAR_MIN_HEIGHT, Math.round((value / maxCount) * BAR_MAX_HEIGHT)) : BAR_MIN_HEIGHT;
          return <View key={bar.key} style={[styles.bar, { height, backgroundColor: color }]} />;
        })}
      </View>
      <View style={styles.labels}>
        <Text variant="caption2" color={systemColors.tertiaryLabel}>
          {minLabel}
        </Text>
        <Text variant="caption2" color={systemColors.tertiaryLabel}>
          {maxLabel}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginTop: spacing[2], gap: 3 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: BAR_MAX_HEIGHT },
  bar: { flex: 1, borderRadius: 2 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
});
