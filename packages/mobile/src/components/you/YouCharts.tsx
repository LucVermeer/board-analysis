import { useState, type ReactNode } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import type { RawBar, RawGroupedBar, RawVPointsTimeline } from '@boardsesh/profile-stats';
import { Text } from '../Text';
import { ActivityIndicator } from '../ActivityIndicator';
import { useTheme } from '../../providers/theme-provider';
import { gradeChartColor, layoutChartColor, flashRedpointColor } from './profile-chart-colors';

const MAX_X_LABELS = 12;

// Keep only ~MAX_X_LABELS evenly-spaced labels; blank the rest so a dense
// 52-week axis stays legible.
function downsampleLabel(index: number, total: number, label: string): string {
  if (total <= MAX_X_LABELS) return label;
  const step = Math.ceil(total / MAX_X_LABELS);
  return index % step === 0 ? label : '';
}

/** Bar width + spacing that fit `count` bars into `width` without scrolling. */
function fitBars(width: number, count: number, minBar = 3): { barWidth: number; spacing: number } {
  if (count <= 0 || width <= 0) return { barWidth: minBar, spacing: 2 };
  const spacing = count > 26 ? 2 : count > 12 ? 4 : 8;
  const initial = 8;
  const available = width - initial * 2 - spacing * (count - 1);
  const barWidth = Math.max(minBar, Math.floor(available / count));
  return { barWidth, spacing };
}

function formatThousands(value: number): string {
  return value >= 1000 ? `${Math.round(value / 100) / 10}k` : `${Math.round(value)}`;
}

type FrameProps = {
  height: number;
  loading?: boolean;
  emptyLabel?: string;
  isEmpty?: boolean;
  children: (width: number) => ReactNode;
};

/** Measures available width and renders loading / empty / chart states. */
function ChartFrame({ height, loading, emptyLabel, isEmpty, children }: FrameProps) {
  const { systemColors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View style={[styles.frame, { height }]} onLayout={onLayout}>
      {loading ? (
        <ActivityIndicator size="small" />
      ) : isEmpty ? (
        <Text variant="footnote" color={systemColors.tertiaryLabel}>
          {emptyLabel}
        </Text>
      ) : width > 0 ? (
        children(width)
      ) : null}
    </View>
  );
}

type StackedBarsProps = {
  bars: RawBar[] | null;
  /** 'grade' colors segments by grade label; 'layout' by layoutKey. */
  colorBy: 'grade' | 'layout';
  height?: number;
  loading?: boolean;
  emptyLabel?: string;
};

/** Stacked bars (weekly activity, grade distribution). */
export function StackedBarChart({ bars, colorBy, height = 170, loading, emptyLabel }: StackedBarsProps) {
  const { systemColors } = useTheme();
  const isEmpty = !bars || bars.length === 0;

  return (
    <ChartFrame height={height} loading={loading} isEmpty={isEmpty} emptyLabel={emptyLabel}>
      {(width) => {
        const list = bars ?? [];
        const { barWidth, spacing } = fitBars(width, list.length);
        const stackData = list.map((bar, index) => {
          const stacks = bar.segments
            .filter((segment) => segment.value > 0)
            .map((segment) => ({
              value: segment.value,
              color: colorBy === 'grade' ? gradeChartColor(segment.key) : layoutChartColor(segment.key),
            }));
          return {
            stacks: stacks.length > 0 ? stacks : [{ value: 0, color: 'transparent' }],
            label: downsampleLabel(index, list.length, bar.label),
          };
        });
        return (
          <BarChart
            stackData={stackData}
            width={width - 8}
            height={height - 28}
            barWidth={barWidth}
            spacing={spacing}
            initialSpacing={8}
            barBorderRadius={2}
            hideRules
            hideYAxisText
            yAxisThickness={0}
            xAxisThickness={StyleSheet.hairlineWidth}
            xAxisColor={systemColors.separator as string}
            rotateLabel
            xAxisLabelTextStyle={{ color: systemColors.tertiaryLabel as string, fontSize: 9 }}
            isAnimated={false}
            disableScroll
          />
        );
      }}
    </ChartFrame>
  );
}

type GroupedBarsProps = {
  bars: RawGroupedBar[] | null;
  height?: number;
  loading?: boolean;
  emptyLabel?: string;
};

/**
 * Grouped bars (flash vs redpoint). gifted-charts has no first-class grouped
 * API, so we flatten to a single data array: two adjacent bars per grade with a
 * wider gap separating groups, and the grade label centered under each pair.
 */
export function GroupedBarChart({ bars, height = 150, loading, emptyLabel }: GroupedBarsProps) {
  const { systemColors } = useTheme();
  const isEmpty = !bars || bars.length === 0;

  return (
    <ChartFrame height={height} loading={loading} isEmpty={isEmpty} emptyLabel={emptyLabel}>
      {(width) => {
        const list = bars ?? [];
        // Two bars per group; reserve group gaps in the width budget.
        const groupGap = 14;
        const innerGap = 2;
        const initial = 8;
        const barWidth = Math.max(
          4,
          Math.floor((width - initial * 2 - groupGap * list.length - innerGap * list.length) / (list.length * 2)),
        );
        const data = list.flatMap((bar) =>
          bar.values.map((value, valueIndex) => ({
            value: value.value,
            frontColor: flashRedpointColor(value.key),
            spacing: valueIndex === 0 ? innerGap : groupGap,
            label: valueIndex === 0 ? bar.label : undefined,
            labelWidth: barWidth * 2 + innerGap,
          })),
        );
        return (
          <BarChart
            data={data}
            width={width - 8}
            height={height - 28}
            barWidth={barWidth}
            initialSpacing={initial}
            barBorderRadius={2}
            hideRules
            hideYAxisText
            yAxisThickness={0}
            xAxisThickness={StyleSheet.hairlineWidth}
            xAxisColor={systemColors.separator as string}
            xAxisLabelTextStyle={{ color: systemColors.tertiaryLabel as string, fontSize: 9 }}
            isAnimated={false}
            disableScroll
          />
        );
      }}
    </ChartFrame>
  );
}

type AreaProps = {
  timeline: RawVPointsTimeline | null;
  color: string;
  height?: number;
  loading?: boolean;
  emptyLabel?: string;
};

/**
 * Cumulative V-points over time. The shared series are per-layout cumulative;
 * we sum them per week into a single running total and render one filled area
 * (gifted-charts' multi-area stacking is unreliable; the per-layout breakdown
 * is conveyed by the grade-distribution chart instead).
 */
export function TotalAreaChart({ timeline, color, height = 170, loading, emptyLabel }: AreaProps) {
  const { systemColors } = useTheme();
  const isEmpty = !timeline || timeline.series.length === 0;

  return (
    <ChartFrame height={height} loading={loading} isEmpty={isEmpty} emptyLabel={emptyLabel}>
      {(width) => {
        const weekLabels = timeline!.weekLabels;
        const totals = weekLabels.map((_, index) =>
          timeline!.series.reduce((sum, series) => sum + (series.data[index] ?? 0), 0),
        );
        const maxValue = Math.max(...totals, 1);
        const sections = 4;
        const yAxisLabelTexts = Array.from({ length: sections + 1 }, (_, index) =>
          formatThousands((maxValue * index) / sections),
        );
        const data = totals.map((value, index) => ({
          value,
          label: downsampleLabel(index, weekLabels.length, weekLabels[index]),
        }));
        const spacing = Math.max(1, Math.floor((width - 40) / Math.max(1, weekLabels.length - 1)));
        return (
          <LineChart
            areaChart
            data={data}
            width={width - 48}
            height={height - 28}
            spacing={spacing}
            initialSpacing={4}
            color={color}
            startFillColor={color}
            endFillColor={color}
            startOpacity={0.35}
            endOpacity={0.05}
            thickness={2}
            hideDataPoints
            curved
            maxValue={maxValue}
            noOfSections={sections}
            yAxisLabelTexts={yAxisLabelTexts}
            yAxisThickness={0}
            xAxisThickness={StyleSheet.hairlineWidth}
            xAxisColor={systemColors.separator as string}
            rulesColor={systemColors.separator as string}
            rulesType="solid"
            yAxisTextStyle={{ color: systemColors.tertiaryLabel as string, fontSize: 9 }}
            xAxisLabelTextStyle={{ color: systemColors.tertiaryLabel as string, fontSize: 9 }}
            isAnimated={false}
            disableScroll
          />
        );
      }}
    </ChartFrame>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
