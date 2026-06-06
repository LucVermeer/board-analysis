import { Pressable, StyleSheet, View } from 'react-native';
import type { Grade } from '@boardsesh/shared-schema';
import type { GradeBound } from '@boardsesh/climb-filters';
import { spacing } from '../../theme/tokens';
import { FILTER_FAB_SIZE, FilterButton } from './FilterButton';
import { GradeRangeRail } from '../grade';

type ClimbFilterFabProps = {
  activeFilterCount: number;
  bottom: number;
  bound: GradeBound;
  grades: readonly Grade[];
  gradeRailVisible: boolean;
  onOpenFilters: () => void;
  onOpenGrade: () => void;
  onCloseGrade: () => void;
  onGradeChange: (grade: GradeBound) => void;
};

export function ClimbFilterFab({
  activeFilterCount,
  bottom,
  bound,
  grades,
  gradeRailVisible,
  onOpenFilters,
  onOpenGrade,
  onCloseGrade,
  onGradeChange,
}: ClimbFilterFabProps) {
  return (
    <>
      {gradeRailVisible ? (
        <Pressable
          style={styles.dismissLayer}
          onPress={onCloseGrade}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      {gradeRailVisible ? (
        <View
          pointerEvents="box-none"
          style={[styles.gradeRailSlot, { bottom: bottom + FILTER_FAB_SIZE + spacing[2] }]}
        >
          <GradeRangeRail grades={grades} bound={bound} onChange={onGradeChange} onRequestClose={onCloseGrade} />
        </View>
      ) : null}
      <View pointerEvents="box-none" style={[styles.fabSlot, { bottom }]}>
        <FilterButton activeFilterCount={activeFilterCount} onPress={onOpenFilters} onLongPress={onOpenGrade} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  dismissLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 15,
  },
  gradeRailSlot: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    zIndex: 20,
  },
  fabSlot: {
    position: 'absolute',
    right: spacing[6] + spacing[1],
    zIndex: 21,
  },
});
