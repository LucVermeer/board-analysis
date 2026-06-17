import { useMemo, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect } from 'react-native-svg';
import type { RawActivityDay, RawActivityHeatmap } from '@boardsesh/profile-stats';
import { Text } from '../Text';
import { useTheme } from '../../providers/theme-provider';
import { brandColors, brandColorsDark, withAlpha } from '../../theme/colors';
import { spacing } from '../../theme/tokens';

const ROWS = 7;
const CELL_GAP = 3;
const CELL_RADIUS = 2;
// Column budget (cell + gap) used to decide how many weeks fit the screen.
const TARGET_COLUMN = 16;
const INTENSITY_STEPS = [0.4, 0.6, 0.8, 1] as const;

type ActivityHeatmapProps = {
  heatmap: RawActivityHeatmap;
};

/**
 * GitHub-style climbing calendar: one cell per day, intensity ∝ ascents that
 * day. The shared builder hands us a whole week-aligned window (≈53 weeks); a
 * phone can't show that many legible columns, so we fit the most recent weeks
 * edge-to-edge — the recent calendar is the part people read. Single instance on
 * a scroll screen, so the SVG grid isn't subject to the list-virtualization rule.
 */
export function ActivityHeatmap({ heatmap }: ActivityHeatmapProps) {
  const { colorScheme, chartColors } = useTheme();
  const { t } = useTranslation('profile');
  const [width, setWidth] = useState(0);

  const columns = useMemo(() => {
    const result: RawActivityDay[][] = [];
    for (let index = 0; index < heatmap.days.length; index += ROWS) {
      result.push(heatmap.days.slice(index, index + ROWS));
    }
    return result;
  }, [heatmap.days]);

  const totals = useMemo(() => {
    let totalClimbs = 0;
    let activeDays = 0;
    for (const day of heatmap.days) {
      totalClimbs += day.count;
      if (day.count > 0) activeDays += 1;
    }
    return { totalClimbs, activeDays };
  }, [heatmap.days]);

  const primary = (colorScheme === 'dark' ? brandColorsDark : brandColors).primary;
  const emptyColor = chartColors.fill;

  const colorForCount = (count: number): string => {
    if (count <= 0) return emptyColor;
    const ratio = count / heatmap.maxCount;
    const stepIndex = Math.min(INTENSITY_STEPS.length - 1, Math.max(0, Math.ceil(ratio * INTENSITY_STEPS.length) - 1));
    return withAlpha(primary, INTENSITY_STEPS[stepIndex]);
  };

  const fitWeeks =
    width > 0 ? Math.min(columns.length, Math.max(1, Math.floor((width + CELL_GAP) / TARGET_COLUMN))) : 0;
  const shown = fitWeeks > 0 ? columns.slice(-fitWeeks) : [];
  const cell = shown.length > 0 ? (width - CELL_GAP * (shown.length - 1)) / shown.length : 0;
  const gridHeight = ROWS * cell + (ROWS - 1) * CELL_GAP;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="image"
      accessibilityLabel={t('stats.calendarAria', { days: totals.activeDays, count: totals.totalClimbs })}
    >
      {width > 0 && cell > 0 ? (
        <Svg width={width} height={gridHeight}>
          {shown.map((column, columnIndex) =>
            column.map((day, rowIndex) => (
              <Rect
                key={day.date}
                x={columnIndex * (cell + CELL_GAP)}
                y={rowIndex * (cell + CELL_GAP)}
                width={cell}
                height={cell}
                rx={CELL_RADIUS}
                fill={colorForCount(day.count)}
              />
            )),
          )}
        </Svg>
      ) : null}

      <View style={styles.legend}>
        <Text variant="caption2" color={chartColors.tertiaryLabel}>
          {t('stats.calendarLess')}
        </Text>
        <View style={styles.legendSwatches}>
          <View style={[styles.swatch, { backgroundColor: emptyColor }]} />
          {INTENSITY_STEPS.map((step) => (
            <View key={step} style={[styles.swatch, { backgroundColor: withAlpha(primary, step) }]} />
          ))}
        </View>
        <Text variant="caption2" color={chartColors.tertiaryLabel}>
          {t('stats.calendarMore')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  legendSwatches: {
    flexDirection: 'row',
    gap: 3,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
});
