// The logbook toolbar's persistent chip row, mirroring the climb list's
// FilterChipRow.ios.tsx: a single <Host> wrapping a horizontal SwiftUI ScrollView
// + HStack of native @expo/ui glass chips. iOS-26 Liquid Glass only (the caller
// gates on the glass variant); Android keeps the sheet's filter/sort.
//
// Order: [Filter] [Latest] [Hardest] [...active-filter chips]. The Filter chip
// opens the long-tail sheet; Latest/Hardest live-commit the sort preset; the
// active-filter chips (grade/date/angle/etc.) read as tinted prominent glass and
// tap back into the sheet to adjust. The active-chip wording is sourced once in
// LogbookChipRow.logic.ts so it never diverges from the badge / sheet.

import { memo, useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Host, HStack, ScrollView, Button } from '@expo/ui/swift-ui';
import { buttonStyle, controlSize, tint, padding } from '@expo/ui/swift-ui/modifiers';
import { useTheme } from '../../providers/theme-provider';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { spacing } from '../../theme/tokens';
import { buildLogbookActiveChips } from './LogbookChipRow.logic';
import type { LogbookChipRowProps } from './LogbookChipRow.types';

function LogbookChipRowComponent({ sortPreset, onSelectPreset, onOpenFilters, filters, grades }: LogbookChipRowProps) {
  const { t } = useTranslation('you');
  const { brandColors } = useTheme();
  const { formatGrade } = useGradeFormat();

  // Active = brand-tinted prominent glass, inactive = neutral glass; @expo/ui
  // guards both with `if #available(iOS 26)`. Matches FilterChipRow's chipModifiers.
  const chipModifiers = useCallback(
    (active: boolean) =>
      active
        ? [buttonStyle('glassProminent'), controlSize('small'), tint(brandColors.primary)]
        : [buttonStyle('glass'), controlSize('small')],
    [brandColors.primary],
  );

  // Rebuilt only when the filters / grade scale / formatter change, so the chip
  // descriptors keep a stable identity between unrelated re-renders.
  const activeChips = useMemo(
    () => buildLogbookActiveChips(filters, grades, formatGrade, t),
    [filters, grades, formatGrade, t],
  );

  return (
    <Host matchContents={{ vertical: true }} style={styles.host}>
      <ScrollView axes="horizontal" showsIndicators={false}>
        {/* Vertical padding gives a pressed chip's glass lens room to expand. */}
        <HStack spacing={spacing[2]} modifiers={[padding({ horizontal: spacing[4], vertical: spacing[2] })]}>
          {/* Filter → the long-tail sheet. An action button, not a menu. Mirrors
              FilterChipRow's icon-led "Filters" entry chip. */}
          <Button
            label={t('mobile.logbook.filter')}
            systemImage="line.3.horizontal.decrease"
            onPress={onOpenFilters}
            modifiers={chipModifiers(false)}
          />

          {/* Latest / Hardest — live-commit the sort preset; null lights neither. */}
          <Button
            label={t('mobile.logbook.preset.latest')}
            onPress={() => onSelectPreset('recent')}
            modifiers={chipModifiers(sortPreset === 'recent')}
          />
          <Button
            label={t('mobile.logbook.preset.hardest')}
            onPress={() => onSelectPreset('hardest')}
            modifiers={chipModifiers(sortPreset === 'hardest')}
          />

          {/* Active-filter chips — prominent glass so "active" reads visually; any
              tap reopens the sheet to adjust that filter (no per-chip menu). */}
          {activeChips.map((chip) => (
            <Button key={chip.key} label={chip.label} onPress={onOpenFilters} modifiers={chipModifiers(true)} />
          ))}
        </HStack>
      </ScrollView>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
  },
});

export const LogbookChipRow = memo(LogbookChipRowComponent);
