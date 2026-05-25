import { describe, it, expect } from 'vitest';
import type { Grade } from '@boardsesh/shared-schema';
import { getFilterSummary } from '../filter-summary';
import { DEFAULT_FILTERS, type ClimbFilters } from '../climb-filter-types';

const mockGrades: Grade[] = [
  { difficultyId: 1, name: 'V0' },
  { difficultyId: 5, name: 'V2' },
  { difficultyId: 10, name: 'V4' },
  { difficultyId: 15, name: 'V6' },
  { difficultyId: 20, name: 'V8' },
];

const mockT = ((key: string, options?: Record<string, unknown>) => {
  const translations: Record<string, string> = {
    'mobile.filter.title': 'Filters',
    'mobile.filter.quality': 'Quality',
    'mobile.filter.difficulty': 'Difficulty',
    'mobile.filter.newest': 'Newest',
    'mobile.filter.popular': 'Popular',
  };
  if (translations[key]) return translations[key];

  if (key === 'mobile.search.gradeRange') return `${options?.min}–${options?.max}`;
  if (key === 'mobile.search.gradeMin') return `${options?.grade}+`;
  if (key === 'mobile.search.gradeMax') return `Up to ${options?.grade}`;
  if (key === 'mobile.search.ascents') return `${options?.count}+ ascents`;
  if (key === 'mobile.search.rating') return `${options?.count}+ stars`;
  if (key === 'mobile.search.more') return `+${options?.count} more`;

  return key;
}) as unknown as Parameters<typeof getFilterSummary>[3];

describe('getFilterSummary', () => {
  it('returns fallback label when no filters are active', () => {
    expect(getFilterSummary(DEFAULT_FILTERS, '', mockGrades, mockT)).toBe('Filters');
  });

  it('shows search text in quotes', () => {
    expect(getFilterSummary(DEFAULT_FILTERS, 'crimp', mockGrades, mockT)).toBe('"crimp"');
  });

  it('shows grade range when both min and max are set', () => {
    const filters: ClimbFilters = { ...DEFAULT_FILTERS, minGrade: 5, maxGrade: 15 };
    expect(getFilterSummary(filters, '', mockGrades, mockT)).toBe('V2–V6');
  });

  it('shows min grade with plus sign', () => {
    const filters: ClimbFilters = { ...DEFAULT_FILTERS, minGrade: 10 };
    expect(getFilterSummary(filters, '', mockGrades, mockT)).toBe('V4+');
  });

  it('shows max grade with up-to prefix', () => {
    const filters: ClimbFilters = { ...DEFAULT_FILTERS, maxGrade: 15 };
    expect(getFilterSummary(filters, '', mockGrades, mockT)).toBe('Up to V6');
  });

  it('shows non-default sort label', () => {
    const filters: ClimbFilters = { ...DEFAULT_FILTERS, sortBy: 'quality' };
    expect(getFilterSummary(filters, '', mockGrades, mockT)).toBe('Quality');
  });

  it('joins two parts with middle dot', () => {
    const filters: ClimbFilters = { ...DEFAULT_FILTERS, minGrade: 10, minAscents: 25 };
    expect(getFilterSummary(filters, '', mockGrades, mockT)).toBe('V4+ · 25+ ascents');
  });

  it('truncates at 2 parts and shows remainder count', () => {
    const filters: ClimbFilters = {
      ...DEFAULT_FILTERS,
      sortBy: 'quality',
      minGrade: 10,
      minAscents: 25,
      minRating: 3,
    };
    const result = getFilterSummary(filters, '', mockGrades, mockT);
    expect(result).toBe('V4+ · Quality · +2 more');
  });

  it('falls back to difficultyId when grade name not found', () => {
    const filters: ClimbFilters = { ...DEFAULT_FILTERS, minGrade: 999 };
    expect(getFilterSummary(filters, '', mockGrades, mockT)).toBe('#999+');
  });

  it('skips grade parts when grades data is undefined', () => {
    const filters: ClimbFilters = { ...DEFAULT_FILTERS, minGrade: 10, minAscents: 5 };
    expect(getFilterSummary(filters, '', undefined, mockT)).toBe('5+ ascents');
  });

  it('includes search text as first part before filter parts', () => {
    const filters: ClimbFilters = { ...DEFAULT_FILTERS, minGrade: 10 };
    expect(getFilterSummary(filters, 'test', mockGrades, mockT)).toBe('"test" · V4+');
  });
});
