import { View, StyleSheet } from 'react-native';
import type { RawLayoutPercentage } from '@boardsesh/profile-stats';
import { Text } from '../Text';
import { layoutChartColor } from './profile-chart-colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { iosSystemColors } from '../../theme/ios-colors';

type LayoutPercentageBarProps = {
  layoutPercentages: RawLayoutPercentage[];
};

/** Horizontal stacked bar showing each layout's share of the user's ascents. */
export function LayoutPercentageBar({ layoutPercentages }: LayoutPercentageBarProps) {
  if (layoutPercentages.length <= 1) return null;

  return (
    <View style={styles.track}>
      {layoutPercentages.map((layout) => (
        <View
          key={layout.layoutKey}
          style={[
            styles.segment,
            { width: `${layout.percentage}%`, backgroundColor: layoutChartColor(layout.layoutKey) },
          ]}
          accessibilityLabel={`${layout.displayName}: ${layout.percentage}%`}
        >
          {layout.percentage >= 15 && (
            <Text variant="caption2" color={iosSystemColors.white} numberOfLines={1} style={styles.label}>
              {`${shortName(layout.displayName)} ${layout.percentage}%`}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

// "Tension Classic" → "Classic"; keeps the inline segment label compact.
function shortName(displayName: string): string {
  const parts = displayName.split(' ');
  return parts[parts.length - 1];
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: 22,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    marginTop: spacing[4],
  },
  segment: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  label: {
    fontWeight: '600',
  },
});
