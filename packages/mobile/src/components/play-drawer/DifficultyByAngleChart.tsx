import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Text } from '../Text';
import type { AngleGradeBar } from './community-utils';
import { useTheme } from '../../providers/theme-provider';

type DifficultyByAngleChartProps = {
  data: AngleGradeBar[];
};

const CHART_HEIGHT = 150;
const AXIS_LABEL_SIZE = 11;
const BAR_RADIUS = 3;
const MIN_BAR_WIDTH = 10;

// Difficulty-by-angle as a column chart: x-axis angles, bar height ∝ the grade's
// position within the local difficulty range (a flat baseline of `min - 1` so
// the easiest angle still shows a stub and steps between angles read clearly),
// the bar drawn in the grade's colour with the grade label above it.
export function DifficultyByAngleChart({ data }: DifficultyByAngleChartProps) {
  const { chartColors } = useTheme();
  const [width, setWidth] = useState(0);

  if (data.length === 0) return null;

  const difficulties = data.map((bar) => bar.difficulty);
  const baseline = Math.min(...difficulties) - 1;
  const range = Math.max(Math.max(...difficulties) - baseline, 1);

  const count = data.length;
  const spacing = count > 8 ? 6 : 12;
  const initialSpacing = 10;
  const barWidth =
    width > 0
      ? Math.max(MIN_BAR_WIDTH, Math.floor((width - initialSpacing * 2 - spacing * count) / count))
      : MIN_BAR_WIDTH;

  const barData = data.map((bar) => ({
    value: bar.difficulty - baseline,
    frontColor: bar.color,
    label: `${bar.angle}°`,
    topLabelComponent: (): ReactNode => (
      <Text variant="caption2" color={bar.color} style={styles.topLabel} numberOfLines={1}>
        {bar.gradeName}
      </Text>
    ),
  }));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View style={styles.container} onLayout={onLayout}>
      {width > 0 ? (
        <BarChart
          data={barData}
          width={width - 8}
          height={CHART_HEIGHT}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={initialSpacing}
          maxValue={range}
          barBorderRadius={BAR_RADIUS}
          hideRules
          hideYAxisText
          yAxisThickness={0}
          xAxisThickness={StyleSheet.hairlineWidth}
          xAxisColor={chartColors.separator}
          xAxisLabelTextStyle={{ color: chartColors.secondaryLabel, fontSize: AXIS_LABEL_SIZE }}
          isAnimated={false}
          disableScroll
          disablePress
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: CHART_HEIGHT + 24,
    justifyContent: 'center',
  },
  topLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
