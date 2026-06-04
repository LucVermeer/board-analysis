// The removable active-filter chips for the climb-list search. Each is a small
// Liquid Glass pill carrying the patch that clears it, so a multi-filter query
// stays visible and one-tap-dismissible. Shown on the second row of the top
// search bar (sticky-strip) and inline in the bottom card (bottom-bar).

import { useMemo } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ClimbBoardFilterState } from '@boardsesh/climb-filters';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { GlassSurface } from '../GlassSurface';
import { PressableSurface } from '../PressableSurface';
import { useTheme } from '../../providers/theme-provider';
import { hapticSelection } from '../../lib/haptics';
import type { ClimbFilters } from '../../lib/climb-filter-types';
import { buildActiveFilterPills } from './active-filter-pills';

type ActiveFilterChipsProps = {
  filters: ClimbFilters;
  boardFilters: ClimbBoardFilterState;
  onPatchFilters: (patch: Partial<ClimbFilters>) => void;
  onPatchBoardFilters: (patch: Partial<ClimbBoardFilterState>) => void;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Pill height — bump to 44 to match the grade pill when shown beside it. */
  chipHeight?: number;
};

export function ActiveFilterChips({
  filters,
  boardFilters,
  onPatchFilters,
  onPatchBoardFilters,
  style,
  contentContainerStyle,
  chipHeight = 30,
}: ActiveFilterChipsProps) {
  const { t } = useTranslation('climbs');
  const { systemColors } = useTheme();

  const pills = useMemo(() => buildActiveFilterPills(filters, boardFilters, t), [filters, boardFilters, t]);

  if (pills.length === 0) return null;

  const radius = chipHeight / 2;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={style}
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      {pills.map((pill) => (
        <PressableSurface
          key={pill.key}
          onPress={() => {
            hapticSelection();
            if (pill.clearFilters) onPatchFilters(pill.clearFilters);
            if (pill.clearBoard) onPatchBoardFilters(pill.clearBoard);
          }}
          feedback="scale"
          scaleTo={0.94}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.search.removeFilter', { name: pill.label })}
          style={[styles.chip, { height: chipHeight, borderRadius: radius }]}
        >
          <GlassSurface
            glassEffectStyle="regular"
            fallbackColor={systemColors.fill}
            borderRadius={radius}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.chipContent, { height: chipHeight }]}>
            <Text variant="caption1" numberOfLines={1} style={styles.chipText}>
              {pill.label}
            </Text>
            <Icon name="close" size={11} color={systemColors.secondaryLabel as string} />
          </View>
        </PressableSurface>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: 10,
    paddingRight: 8,
  },
  chipText: {
    fontWeight: '500',
    maxWidth: 140,
  },
});
