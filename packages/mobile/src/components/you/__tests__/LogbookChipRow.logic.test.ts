import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { Grade } from '@boardsesh/shared-schema';
import { DEFAULT_LOGBOOK_FILTERS, type LogbookFilterState } from '@boardsesh/logbook';
import { angleChipLabel, buildLogbookActiveChips, dateChipLabel, gradeChipLabel } from '../LogbookChipRow.logic';

// A grade scale (difficultyId → raw name) plus a formatter that renders the raw
// name as its V-grade — mirroring how GradeRangeRail resolves a chip label.
const GRADES: Grade[] = [
  { difficultyId: 10, name: '6a' },
  { difficultyId: 12, name: '6a+' },
  { difficultyId: 14, name: '6b' },
];
const V_BY_NAME: Record<string, string> = { '6a': 'V3', '6a+': 'V4', '6b': 'V5' };
const formatGrade = (name: string): string | null => V_BY_NAME[name] ?? null;

// Stub t: return the key for plain keys, interpolate {{date}} for the date keys.
const t = ((key: string, opts?: { date?: string }) => {
  if (opts?.date) return `${key}:${opts.date}`;
  return key;
}) as unknown as TFunction<'you'>;

function withFilters(patch: Partial<LogbookFilterState>): LogbookFilterState {
  return { ...DEFAULT_LOGBOOK_FILTERS, ...patch };
}

describe('buildLogbookActiveChips', () => {
  it('returns [] for the default filters', () => {
    expect(buildLogbookActiveChips(DEFAULT_LOGBOOK_FILTERS, GRADES, formatGrade, t)).toEqual([]);
  });

  it('emits a sends chip when attempts are excluded', () => {
    const chips = buildLogbookActiveChips(withFilters({ includeAttempts: false }), GRADES, formatGrade, t);
    expect(chips).toEqual([{ key: 'status', label: 'mobile.logbook.status.sends' }]);
  });

  it('emits an attempts chip when sends are excluded', () => {
    const chips = buildLogbookActiveChips(withFilters({ includeSends: false }), GRADES, formatGrade, t);
    expect(chips).toEqual([{ key: 'status', label: 'mobile.logbook.status.attempts' }]);
  });

  it('emits a flash chip when flashOnly is set', () => {
    const chips = buildLogbookActiveChips(withFilters({ flashOnly: true }), GRADES, formatGrade, t);
    expect(chips).toEqual([{ key: 'flash', label: 'mobile.logbook.flashOnly' }]);
  });

  it('emits a benchmark chip when benchmarkOnly is set', () => {
    const chips = buildLogbookActiveChips(withFilters({ benchmarkOnly: true }), GRADES, formatGrade, t);
    expect(chips).toEqual([{ key: 'benchmark', label: 'mobile.logbook.benchmarksOnly' }]);
  });

  it('emits a grade chip with the V-range label', () => {
    const chips = buildLogbookActiveChips(withFilters({ minGrade: 10, maxGrade: 14 }), GRADES, formatGrade, t);
    expect(chips).toEqual([{ key: 'grade', label: 'V3–V5' }]);
  });

  it('emits an angle chip with the degree-range label', () => {
    const chips = buildLogbookActiveChips(withFilters({ angleRange: [20, 40] }), GRADES, formatGrade, t);
    expect(chips).toEqual([{ key: 'angle', label: '20°–40°' }]);
  });

  it('emits a date chip with the localized short range', () => {
    const chips = buildLogbookActiveChips(
      withFilters({ fromDate: '2026-06-01', toDate: '2026-06-30' }),
      GRADES,
      formatGrade,
      t,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].key).toBe('date');
    expect(chips[0].label).toContain('–');
  });

  it('combines multiple non-default fields in sheet order', () => {
    const chips = buildLogbookActiveChips(
      withFilters({ includeAttempts: false, flashOnly: true, minGrade: 12, maxGrade: 12, benchmarkOnly: true }),
      GRADES,
      formatGrade,
      t,
    );
    expect(chips.map((chip) => chip.key)).toEqual(['status', 'flash', 'grade', 'benchmark']);
    expect(chips.find((chip) => chip.key === 'grade')?.label).toBe('V4');
  });
});

describe('gradeChipLabel', () => {
  const gradesById = new Map(GRADES.map((grade) => [grade.difficultyId, grade.name]));

  it('formats a two-ended range with an en dash', () => {
    expect(gradeChipLabel(10, 14, gradesById, formatGrade)).toBe('V3–V5');
  });

  it('collapses equal bounds to a single grade', () => {
    expect(gradeChipLabel(12, 12, gradesById, formatGrade)).toBe('V4');
  });

  it('prefixes a min-only bound with ≥', () => {
    expect(gradeChipLabel(12, '', gradesById, formatGrade)).toBe('≥V4');
  });

  it('prefixes a max-only bound with ≤', () => {
    expect(gradeChipLabel('', 14, gradesById, formatGrade)).toBe('≤V5');
  });

  it('falls back to the id when the grade is off-scale', () => {
    expect(gradeChipLabel(99, '', gradesById, formatGrade)).toBe('≥99');
  });
});

describe('dateChipLabel', () => {
  it('joins both bounds with an en dash', () => {
    const label = dateChipLabel('2026-06-01', '2026-06-30', t);
    expect(label).toContain('–');
  });

  it('uses the Since prefix for a from-only bound', () => {
    const label = dateChipLabel('2026-06-01', '', t);
    expect(label?.startsWith('mobile.logbook.dateSince:')).toBe(true);
  });

  it('uses the Until prefix for a to-only bound', () => {
    const label = dateChipLabel('', '2026-06-30', t);
    expect(label?.startsWith('mobile.logbook.dateUntil:')).toBe(true);
  });

  it('returns null when neither bound parses', () => {
    expect(dateChipLabel('not-a-date', '', t)).toBeNull();
  });
});

describe('angleChipLabel', () => {
  it('formats a degree range', () => {
    expect(angleChipLabel([5, 45])).toBe('5°–45°');
  });
});
