import { memo, useMemo, useState, type ReactNode } from 'react';
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
// Width reserved for the y-axis ascent-count labels (e.g. "120", "1.2k").
const Y_AXIS_LABEL_WIDTH = 32;

// Compact tick label: whole numbers below 1k, "1.2k" above so labels stay narrow.
function formatCount(value: number): string {
  return value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value);
}

// Round a raw step up to a friendly 1/2/5 × 10ⁿ value so ticks read 0/5/10/15
// instead of 0/3/6/9.
function niceStep(rawStep: number): number {
  if (rawStep <= 1) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  for (const multiple of [1, 2, 5]) {
    if (rawStep <= multiple * magnitude) return multiple * magnitude;
  }
  return 10 * magnitude;
}

// Integer y-scale for the ascent counts: ~4 whole-number sections with the top
// tick strictly above the tallest bar so its grade top-label has headroom.
function buildAscentScale(maxSends: number): { maxValue: number; noOfSections: number; labels: string[] } {
  const peak = Math.max(maxSends, 1);
  const step = niceStep(Math.ceil(peak / 4));
  let noOfSections = Math.ceil(peak / step);
  if (step * noOfSections <= peak) noOfSections += 1;
  const labels = Array.from({ length: noOfSections + 1 }, (_, index) => formatCount(index * step));
  return { maxValue: step * noOfSections, noOfSections, labels };
}

// Ascents-by-angle column chart: x-axis angles, bar height = the number of
// ascents (ascensionist count) at that angle, the bar drawn in the grade's
// scheme-aware colour with the grade label above it and the ascent count on the
// y-axis. The hardest angle is flagged with a non-colour cue (bold label + larger
// cap) so the hardest grade survives colour-blindness and both schemes/variants —
// note that, since height now means ascents, the hardest angle is no longer
// necessarily the tallest bar.
export const DifficultyByAngleChart = memo(function DifficultyByAngleChart({
  data,
  accessibilityLabel,
}: DifficultyByAngleChartProps) {
  const { chartColors, colorScheme } = useTheme();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);

  // Bars + axis scale only depend on the data + scheme — memoize so a parent
  // re-render (or a width change) doesn't rebuild them (and their top-label
  // closures) every time.
  const model = useMemo(() => {
    if (data.length === 0) return null;
    const scale = buildAscentScale(Math.max(...data.map((bar) => bar.sends)));
    // The single hardest angle (first max wins on ties) gets the redundant cue.
    const hardestAngle = data.reduce((peak, bar) => (bar.difficulty > peak.difficulty ? bar : peak)).angle;
    const barData = data.map((bar) => {
      const fill = gradeChartColor(bar.gradeName, colorScheme);
      const isHardest = bar.angle === hardestAngle;
      const topRadius = isHardest ? PEAK_BAR_RADIUS : BAR_RADIUS;
      return {
        value: bar.sends,
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
    return { barData, maxValue: scale.maxValue, noOfSections: scale.noOfSections, yAxisLabelTexts: scale.labels };
  }, [data, colorScheme]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  if (!model) return null;

  const count = data.length;
  const barSpacing = count > 8 ? 6 : 12;
  const initialSpacing = 10;
  // Reserve space for the y-axis labels so the bars + axis fit the measured width.
  const plotWidth = Math.max(0, width - Y_AXIS_LABEL_WIDTH);
  const barWidth =
    plotWidth > 0
      ? Math.max(MIN_BAR_WIDTH, Math.floor((plotWidth - initialSpacing * 2 - barSpacing * count) / count))
      : MIN_BAR_WIDTH;

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
          data={model.barData}
          width={plotWidth - 8}
          height={CHART_HEIGHT}
          barWidth={barWidth}
          spacing={barSpacing}
          initialSpacing={initialSpacing}
          maxValue={model.maxValue}
          noOfSections={model.noOfSections}
          yAxisLabelTexts={model.yAxisLabelTexts}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          topLabelContainerStyle={styles.topLabelContainer}
          rulesColor={chartColors.separator}
          rulesType="solid"
          yAxisThickness={0}
          xAxisThickness={StyleSheet.hairlineWidth}
          xAxisColor={chartColors.separator}
          xAxisLabelTextStyle={{ color: chartColors.secondaryLabel, fontSize: AXIS_LABEL_SIZE }}
          yAxisTextStyle={{ color: chartColors.secondaryLabel, fontSize: AXIS_LABEL_SIZE }}
          isAnimated={!reduceMotion}
          animationDuration={reduceMotion ? 0 : 600}
          disableScroll
          disablePress
        />
      ) : null}
    </View>
  );
});

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
