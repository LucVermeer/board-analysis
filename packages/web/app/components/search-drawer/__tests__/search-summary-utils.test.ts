import { describe, it, expect } from 'vite-plus/test';
import {
  hasActiveNonNameFilters,
  hasActiveFilters,
  getStatusPanelSummary,
  getQualityPanelSummary,
  getSearchPillSummary,
  getZonePanelSummary,
} from '../search-summary-utils';
import { DEFAULT_SEARCH_PARAMS } from '@/app/lib/url-utils';
import type { SearchRequestPagination } from '@/app/lib/types';

function makeParams(overrides: Partial<SearchRequestPagination> = {}): SearchRequestPagination {
  return { ...DEFAULT_SEARCH_PARAMS, ...overrides } as SearchRequestPagination;
}

const summaryLabels = {
  empty: 'What do you want to climb?',
  climb: {
    gradeFallback: (gradeId: number) => `Grade ${gradeId}`,
    upToGrade: (gradeName: string) => `Up to ${gradeName}`,
    setterCount: (count: number) => `${count} setters`,
    routesOnly: 'Routes only',
    bouldersAndRoutes: 'Boulders & routes',
  },
  quality: {
    ascents: (count: number) => `${count}+ ascents`,
    rating: (rating: number) => `${rating}+ rating`,
    classics: 'Classics',
    gradeAccuracy: 'Grade accuracy',
    tallClimbsOnly: 'Tall',
    wideClimbsOnly: 'Wide',
    betaVideosOnly: 'Beta',
  },
  status: {
    drafts: 'Drafts',
    projects: 'Projects',
    established: 'Established',
  },
  user: {
    attempted: 'attempted',
    completed: 'completed',
    hide: (filters: string) => `Hide ${filters}`,
    only: (filters: string) => `Only ${filters}`,
  },
  holds: {
    count: (count: number) => `${count} hold${count !== 1 ? 's' : ''}`,
  },
  zone: 'Zone',
  zoneModes: {
    allHolds: 'All holds inside',
    anyHold: 'At least 1 hold',
  },
  more: (count: number) => `+${count} more`,
};

describe('hasActiveNonNameFilters', () => {
  it('returns false when all params match defaults', () => {
    expect(hasActiveNonNameFilters(makeParams())).toBe(false);
  });

  it('returns false when only the name filter is active', () => {
    expect(hasActiveNonNameFilters(makeParams({ name: 'Cool Boulder' }))).toBe(false);
  });

  it('returns true when minGrade is set', () => {
    expect(hasActiveNonNameFilters(makeParams({ minGrade: 16 }))).toBe(true);
  });

  it('returns true when maxGrade is set', () => {
    expect(hasActiveNonNameFilters(makeParams({ maxGrade: 24 }))).toBe(true);
  });

  it('returns true when grade filters are active even with a name filter', () => {
    expect(hasActiveNonNameFilters(makeParams({ name: 'Test', minGrade: 10, maxGrade: 20 }))).toBe(true);
  });

  it('returns true when holdsFilter has entries', () => {
    expect(
      hasActiveNonNameFilters(
        makeParams({
          holdsFilter: { 1: { HAND: 'include' as const } },
        }),
      ),
    ).toBe(true);
  });

  it('returns false for a zone mode without an active zone', () => {
    expect(hasActiveNonNameFilters(makeParams({ zoneMode: 'anyHold' }))).toBe(false);
  });

  it('returns false when holdsFilter is empty object', () => {
    expect(hasActiveNonNameFilters(makeParams({ holdsFilter: {} }))).toBe(false);
  });

  it('returns true when onlyBenchmarks is true', () => {
    expect(hasActiveNonNameFilters(makeParams({ onlyBenchmarks: true }))).toBe(true);
  });

  it('returns true when minAscents differs from default', () => {
    expect(hasActiveNonNameFilters(makeParams({ minAscents: 5 }))).toBe(true);
  });

  it('returns true when minRating differs from default', () => {
    expect(hasActiveNonNameFilters(makeParams({ minRating: 3 }))).toBe(true);
  });

  it('returns true when hideAttempted is true', () => {
    expect(hasActiveNonNameFilters(makeParams({ hideAttempted: true }))).toBe(true);
  });

  it('returns true when sortBy differs from default', () => {
    expect(hasActiveNonNameFilters(makeParams({ sortBy: 'quality' }))).toBe(true);
  });
});

describe('hasActiveFilters', () => {
  it('returns false when all params match defaults', () => {
    expect(hasActiveFilters(makeParams())).toBe(false);
  });

  it('returns true when name is set (unlike hasActiveNonNameFilters)', () => {
    expect(hasActiveFilters(makeParams({ name: 'Cool Boulder' }))).toBe(true);
  });

  it('returns true when grade filters are active', () => {
    expect(hasActiveFilters(makeParams({ minGrade: 10 }))).toBe(true);
  });

  it('returns true when holdsFilter has entries', () => {
    expect(
      hasActiveFilters(
        makeParams({
          holdsFilter: { 1: { HAND: 'include' as const } },
        }),
      ),
    ).toBe(true);
  });
});

describe('getStatusPanelSummary', () => {
  it('returns empty for defaults', () => {
    expect(getStatusPanelSummary(makeParams(), summaryLabels.status)).toEqual([]);
  });

  it('returns ["Drafts"] when onlyDrafts is true (takes precedence over minAscents)', () => {
    expect(getStatusPanelSummary(makeParams({ onlyDrafts: true, minAscents: 5 }), summaryLabels.status)).toEqual([
      'Drafts',
    ]);
  });

  it('returns ["Projects"] when projectsOnly is true', () => {
    expect(getStatusPanelSummary(makeParams({ projectsOnly: true }), summaryLabels.status)).toEqual(['Projects']);
  });

  it('returns ["Established"] when minAscents is exactly 2', () => {
    expect(getStatusPanelSummary(makeParams({ minAscents: 2 }), summaryLabels.status)).toEqual(['Established']);
  });

  it('returns ["Established"] when minAscents is >= 2 (e.g. 3, 10)', () => {
    expect(getStatusPanelSummary(makeParams({ minAscents: 3 }), summaryLabels.status)).toEqual(['Established']);
    expect(getStatusPanelSummary(makeParams({ minAscents: 10 }), summaryLabels.status)).toEqual(['Established']);
  });

  it('returns empty when minAscents is 1 (below the established threshold)', () => {
    expect(getStatusPanelSummary(makeParams({ minAscents: 1 }), summaryLabels.status)).toEqual([]);
  });
});

describe('getQualityPanelSummary vs Status (no duplication)', () => {
  it('includes "1+ ascents" when minAscents is 1 (below Established)', () => {
    expect(getQualityPanelSummary(makeParams({ minAscents: 1 }), summaryLabels.quality)).toContain('1+ ascents');
  });

  it('rounds legacy decimal minRating summaries up to whole stars', () => {
    expect(getQualityPanelSummary(makeParams({ minRating: 2.5 }), summaryLabels.quality)).toContain('3+ rating');
  });

  it('uses the translated wide climbs summary label', () => {
    expect(getQualityPanelSummary(makeParams({ onlyWideClimbs: true }), summaryLabels.quality)).toContain('Wide');
  });

  it('uses the translated tall climbs summary label', () => {
    expect(getQualityPanelSummary(makeParams({ onlyTallClimbs: true }), summaryLabels.quality)).toContain('Tall');
  });

  it('uses the translated beta videos summary label', () => {
    expect(getQualityPanelSummary(makeParams({ onlyWithBetaVideos: true }), summaryLabels.quality)).toContain('Beta');
  });

  it('does not include "N+ ascents" when minAscents is 2 (Established handles it)', () => {
    const parts = getQualityPanelSummary(makeParams({ minAscents: 2 }), summaryLabels.quality);
    expect(parts.find((p) => p.includes('ascents'))).toBeUndefined();
  });

  it('does not include "N+ ascents" when minAscents is 3 (Established handles it)', () => {
    const parts = getQualityPanelSummary(makeParams({ minAscents: 3 }), summaryLabels.quality);
    expect(parts.find((p) => p.includes('ascents'))).toBeUndefined();
  });

  it('pill summary for minAscents=3 shows "Established" only, no duplicate', () => {
    const pill = getSearchPillSummary(makeParams({ minAscents: 3 }), summaryLabels);
    expect(pill).toContain('Established');
    expect(pill).not.toContain('3+ ascents');
  });

  it('pill summary for projects shows "Projects"', () => {
    const pill = getSearchPillSummary(makeParams({ projectsOnly: true }), summaryLabels);
    expect(pill).toContain('Projects');
  });

  it('pill summary truncates at 2 items with +N more', () => {
    const pill = getSearchPillSummary(
      makeParams({ minGrade: 16, minRating: 3, onlyBenchmarks: true, onlyTallClimbs: true }),
      summaryLabels,
    );
    const parts = pill.split(' · ');
    expect(parts).toHaveLength(3);
    expect(parts[2]).toBe('+2 more');
  });

  it('pill summary for drafts shows "Drafts"', () => {
    const pill = getSearchPillSummary(makeParams({ onlyDrafts: true }), summaryLabels);
    expect(pill).toContain('Drafts');
  });
});

describe('getZonePanelSummary', () => {
  const zoneBox = { edgeLeft: 1, edgeRight: 2, edgeBottom: 3, edgeTop: 4 };

  it('returns empty when no zone is active', () => {
    expect(getZonePanelSummary(makeParams(), summaryLabels.zone, summaryLabels.zoneModes)).toEqual([]);
  });

  it('includes the all-holds mode when a zone is active', () => {
    expect(
      getZonePanelSummary(makeParams({ zoneBox, zoneMode: 'allHolds' }), summaryLabels.zone, summaryLabels.zoneModes),
    ).toEqual(['Zone: All holds inside']);
  });

  it('includes the any-hold mode when a zone is active', () => {
    expect(
      getZonePanelSummary(makeParams({ zoneBox, zoneMode: 'anyHold' }), summaryLabels.zone, summaryLabels.zoneModes),
    ).toEqual(['Zone: At least 1 hold']);
  });
});
