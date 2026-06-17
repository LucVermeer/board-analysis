import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Text } from '../Text';
import type { AngleGradeBar } from './community-utils';
import { useTheme } from '../../providers/theme-provider';
import { useReduceMotion } from '../../hooks/use-reduce-motion';
import { gradeChartColor } from '../you/profile-chart-colors';
import { borderRadius, spacing } from '../../theme/tokens';

type DifficultyByAngleChartProps = {
  data: AngleGradeBar[];
  accessibilityLabel?: string;
};

const CHART_HEIGHT = 150;
const AXIS_LABEL_SIZE = 11;
// Default top-corner radius for bars; the hardest angle gets a softer, larger cap.
const BAR_RADIUS = borderRadius.sm;
const PEAK_BAR_RADIUS = borderRadius.md;
const TOP_LABEL_HEIGHT = 16;
const MIN_BAR_WIDTH = 10;

// Difficulty-by-angle as a column chart: x-axis angles, bar height ∝ the grade's
// position within the local difficulty range (a flat baseline of `min - 1` so
// the easiest angle still shows a stub and steps between angles read clearly),
// the bar drawn in the grade's scheme-aware colour with the grade label above it.
// The hardest angle is flagged with a non-colour cue (bold label + larger cap) so
// it survives colour-blindness and both schemes/variants.
export function DifficultyByAngleChart({ data, accessibilityLabel }: DifficultyByAngleChartProps) {
  const { chartColors, colorScheme } = useTheme();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);

  if (data.length === 0) return null;

  const difficulties = data.map((bar) => bar.difficulty);
  const baseline = Math.min(...difficulties) - 1;
  const range = Math.max(Math.max(...difficulties) - baseline, 1);
  // +1 headroom so the tallest (hardest-angle) bar doesn't pin to the top edge
  // and crowd its grade top-label.
  const chartMaxValue = range + 1;
  // The single hardest angle (first max wins on ties) gets the redundant cue.
  const hardestAngle = data.reduce((peak, bar) => (bar.difficulty > peak.difficulty ? bar : peak)).angle;

  const count = data.length;
  const barSpacing = count > 8 ? 6 : 12;
  const initialSpacing = 10;
  const barWidth =
    width > 0
      ? Math.max(MIN_BAR_WIDTH, Math.floor((width - initialSpacing * 2 - barSpacing * count) / count))
      : MIN_BAR_WIDTH;

  const barData = data.map((bar) => {
    const fill = gradeChartColor(bar.gradeName, colorScheme);
    const isHardest = bar.angle === hardestAngle;
    const topRadius = isHardest ? PEAK_BAR_RADIUS : BAR_RADIUS;
    return {
      value: bar.difficulty - baseline,
      frontColor: fill,
      label: `${bar.angle}°`,
      barBorderTopLeftRadius: topRadius,
      barBorderTopRightRadius: topRadius,
      barBorderBottomLeftRadius: 0,
      barBorderBottomRightRadius: 0,
      topLabelComponentHeight: TOP_LABEL_HEIGHT,
      topLabelComponent: (): ReactNode => (
        <Text
          variant="caption2"
          color={fill}
          style={isHardest ? styles.topLabelPeak : styles.topLabel}
          numberOfLines={1}
        >
          {bar.gradeName}
        </Text>
      ),
    };
  });

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View
      style={styles.container}
      onLayout={onLayout}
      accessible={accessibilityLabel ? true : undefined}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {width > 0 ? (
        <BarChart
          data={barData}
          width={width - 8}
          height={CHART_HEIGHT}
          barWidth={barWidth}
          spacing={barSpacing}
          initialSpacing={initialSpacing}
          maxValue={chartMaxValue}
          topLabelContainerStyle={styles.topLabelContainer}
          hideRules
          hideYAxisText
          yAxisThickness={0}
          xAxisThickness={StyleSheet.hairlineWidth}
          xAxisColor={chartColors.separator}
          xAxisLabelTextStyle={{ color: chartColors.secondaryLabel, fontSize: AXIS_LABEL_SIZE }}
          isAnimated={!reduceMotion}
          animationDuration={reduceMotion ? 0 : 600}
          disableScroll
          disablePress
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: CHART_HEIGHT + spacing[6],
    justifyContent: 'center',
  },
  topLabelContainer: {
    marginBottom: spacing[1],
  },
  topLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
  topLabelPeak: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
