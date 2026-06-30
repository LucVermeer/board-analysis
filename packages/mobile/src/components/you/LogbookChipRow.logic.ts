// Pure label builders for the logbook chip row (LogbookChipRow.ios.tsx renders
// the native @expo/ui SwiftUI chips on top of these). No @expo/ui / react-native
// imports so the chip wording is unit-testable without a native host (the
// LogbookChipRow vite alias swaps the COMPONENT for a null stub under Vitest, but
// this `.logic` module is not aliased, so its functions run for real).
//
// An active-filter chip is included ONLY when its field is non-default, mirroring
// countActiveLogbookFilters in use-logbook-search.ts so a chip never appears for a
// filter the badge wouldn't count (and vice versa). Defaults in → returns [].

import type { TFunction } from 'i18next';
import type { Grade } from '@boardsesh/shared-schema';
import { DEFAULT_LOGBOOK_ANGLE_RANGE, type LogbookFilterState } from '@boardsesh/logbook';

/** An active-filter chip: a stable key (for React) + the localised label. */
export type LogbookActiveChip = { key: string; label: string };

/**
 * Resolve a difficulty id to its display label via the same grade list +
 * V/font formatter the filter sheet's GradeRangeRail uses, so the chip and the
 * rail never word a grade differently. Falls back to the raw scale name (then the
 * id) when the formatter can't render it.
 */
function gradeName(
  difficultyId: number,
  gradesById: Map<number, string>,
  formatGrade: (name: string) => string | null,
): string {
  const rawName = gradesById.get(difficultyId);
  if (rawName == null) return String(difficultyId);
  return formatGrade(rawName) ?? rawName;
}

/**
 * Grade-bound chip wording: "V4–V6" (both bounds, en dash), "V5" (equal bounds),
 * "≥V4" (only min set), "≤V6" (only max set). Caller guards that at least one
 * bound is set before calling.
 */
export function gradeChipLabel(
  minGrade: number | '',
  maxGrade: number | '',
  gradesById: Map<number, string>,
  formatGrade: (name: string) => string | null,
): string {
  const minLabel = minGrade === '' ? null : gradeName(minGrade, gradesById, formatGrade);
  const maxLabel = maxGrade === '' ? null : gradeName(maxGrade, gradesById, formatGrade);
  if (minLabel != null && maxLabel != null) {
    return minGrade === maxGrade ? minLabel : `${minLabel}–${maxLabel}`;
  }
  if (minLabel != null) return `≥${minLabel}`;
  // maxLabel is non-null here (caller guarantees one bound set).
  return `≤${maxLabel}`;
}

/** Localise one ISO date short ("Jun 30"); null when the ISO can't be parsed. */
function formatShortDate(iso: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Date-range chip wording: both bounds → "<from> – <to>"; only from → "Since
 * <from>"; only to → "Until <to>". Returns null when neither bound parses (so the
 * chip is dropped rather than showing a half-formed range). Caller guards that at
 * least one bound is set before calling.
 */
export function dateChipLabel(fromDate: string, toDate: string, t: TFunction<'you'>): string | null {
  const fromLabel = formatShortDate(fromDate);
  const toLabel = formatShortDate(toDate);
  if (fromLabel != null && toLabel != null) return `${fromLabel} – ${toLabel}`;
  if (fromLabel != null) return t('mobile.logbook.dateSince', { date: fromLabel });
  if (toLabel != null) return t('mobile.logbook.dateUntil', { date: toLabel });
  return null;
}

/** Angle-range chip wording: "20°–40°". Caller guards non-default before calling. */
export function angleChipLabel(angleRange: [number, number]): string {
  return `${angleRange[0]}°–${angleRange[1]}°`;
}

/**
 * The ordered active-filter chips for the chip row: one per non-default field,
 * in the same order the filter sheet groups them (status / flash / grade / angle
 * → date / benchmarks). Defaults in → [].
 */
export function buildLogbookActiveChips(
  filters: LogbookFilterState,
  grades: readonly Grade[],
  formatGrade: (name: string) => string | null,
  t: TFunction<'you'>,
): LogbookActiveChip[] {
  const chips: LogbookActiveChip[] = [];

  // Status — a chip only when one of sends/attempts is excluded ("Both" = default).
  if (!(filters.includeSends && filters.includeAttempts)) {
    const statusLabel =
      filters.includeSends && !filters.includeAttempts
        ? t('mobile.logbook.status.sends')
        : t('mobile.logbook.status.attempts');
    chips.push({ key: 'status', label: statusLabel });
  }

  if (filters.flashOnly) {
    chips.push({ key: 'flash', label: t('mobile.logbook.flashOnly') });
  }

  if (filters.minGrade !== '' || filters.maxGrade !== '') {
    const gradesById = new Map(grades.map((grade) => [grade.difficultyId, grade.name]));
    chips.push({ key: 'grade', label: gradeChipLabel(filters.minGrade, filters.maxGrade, gradesById, formatGrade) });
  }

  if (
    filters.angleRange[0] !== DEFAULT_LOGBOOK_ANGLE_RANGE[0] ||
    filters.angleRange[1] !== DEFAULT_LOGBOOK_ANGLE_RANGE[1]
  ) {
    chips.push({ key: 'angle', label: angleChipLabel(filters.angleRange) });
  }

  if (filters.fromDate || filters.toDate) {
    const dateLabel = dateChipLabel(filters.fromDate, filters.toDate, t);
    if (dateLabel != null) chips.push({ key: 'date', label: dateLabel });
  }

  if (filters.benchmarkOnly) {
    chips.push({ key: 'benchmark', label: t('mobile.logbook.benchmarksOnly') });
  }

  return chips;
}
