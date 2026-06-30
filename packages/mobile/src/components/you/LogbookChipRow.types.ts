// Platform-split so @expo/ui/swift-ui (resolves native views at module load)
// never reaches the Android bundle; Android keeps the sheet's filter/sort.

import type { Grade } from '@boardsesh/shared-schema';
import type { LogbookFilterState, LogbookSortPreset } from '@boardsesh/logbook';

export type LogbookChipRowProps = {
  /** Which preset to highlight (Latest = 'recent'); null lights no chip — a
   *  non-preset sort is active. */
  sortPreset: LogbookSortPreset | null;
  /** Live-commit a preset when its chip is tapped (persists via setPreset). */
  onSelectPreset: (preset: LogbookSortPreset) => void;
  /** Open the filter sheet — the Filter chip and every active-filter chip tap. */
  onOpenFilters: () => void;
  /** Committed filters → the active-filter chips (grade/date/angle/etc.). */
  filters: LogbookFilterState;
  /** Grade scale (difficultyId → name) for the grade chip's V/font label. Same
   *  source the filter sheet's GradeRangeRail uses so the wording never diverges. */
  grades: readonly Grade[];
};
