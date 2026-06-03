// Sticky-strip search layout: grade + count + filters in a flat strip directly
// under the nav header. No collision with the queue bar; the climber can switch
// to the bottom-bar layout in Settings.

import { StyleSheet, View } from 'react-native';
import type { Grade } from '@boardsesh/shared-schema';
import type { GradeBound } from '@boardsesh/climb-filters';
import { useTheme } from '../../providers/theme-provider';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';
import { ClimbSearchControls } from './ClimbSearchControls';

type StickyFilterStripProps = {
  bound: GradeBound;
  grades: readonly Grade[];
  count: number | undefined;
  activeFilterCount: number;
  onOpenGrade: () => void;
  onOpenFilters: () => void;
};

export function StickyFilterStrip(props: StickyFilterStripProps) {
  const { systemColors } = useTheme();

  return (
    <View style={[styles.strip, { backgroundColor: systemColors.background as string }]}>
      <ClimbSearchControls {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: iosSystemColors.separator,
  },
});
