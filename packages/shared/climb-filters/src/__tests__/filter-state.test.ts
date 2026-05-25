import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CLIMB_FILTER_STATE,
  hasActiveClimbFilters,
  statusToFlags,
  flagsToStatus,
  toClimbSearchInput,
  type ClimbFilterState,
  type BoardSearchConfig,
  type SearchPagination,
  type StatusFilter,
} from '../filter-state';

const board: BoardSearchConfig = {
  boardName: 'kilter',
  layoutId: 1,
  sizeId: 10,
  setIds: '1,20',
  angle: 40,
};

const pagination: SearchPagination = { page: 0, pageSize: 30 };

describe('DEFAULT_CLIMB_FILTER_STATE', () => {
  it('matches the documented defaults', () => {
    expect(DEFAULT_CLIMB_FILTER_STATE).toEqual({
      sortBy: 'ascents',
      sortOrder: 'desc',
      status: 'any',
    });
  });
});

describe('hasActiveClimbFilters', () => {
  it('returns false for the default state', () => {
    expect(hasActiveClimbFilters(DEFAULT_CLIMB_FILTER_STATE)).toBe(false);
  });

  it('returns true when sortBy differs from default', () => {
    expect(hasActiveClimbFilters({ ...DEFAULT_CLIMB_FILTER_STATE, sortBy: 'quality' })).toBe(true);
  });

  it('returns true when sortOrder differs from default', () => {
    expect(hasActiveClimbFilters({ ...DEFAULT_CLIMB_FILTER_STATE, sortOrder: 'asc' })).toBe(true);
  });

  it('returns true when status differs from default', () => {
    expect(hasActiveClimbFilters({ ...DEFAULT_CLIMB_FILTER_STATE, status: 'drafts' })).toBe(true);
  });

  it.each([
    ['minGrade', { minGrade: 10 }],
    ['maxGrade', { maxGrade: 20 }],
    ['minAscents', { minAscents: 5 }],
    ['minRating', { minRating: 3 }],
    ['gradeAccuracy', { gradeAccuracy: '0.1' as const }],
    ['setter', { setter: ['alice'] }],
    ['onlyTallClimbs', { onlyTallClimbs: true }],
    ['onlyWideClimbs', { onlyWideClimbs: true }],
    ['hideAttempted', { hideAttempted: true }],
    ['hideCompleted', { hideCompleted: true }],
    ['showOnlyAttempted', { showOnlyAttempted: true }],
    ['showOnlyCompleted', { showOnlyCompleted: true }],
  ])('returns true when %s is set', (_label, overrides) => {
    expect(hasActiveClimbFilters({ ...DEFAULT_CLIMB_FILTER_STATE, ...overrides })).toBe(true);
  });

  it('returns false when setter is an empty array', () => {
    expect(hasActiveClimbFilters({ ...DEFAULT_CLIMB_FILTER_STATE, setter: [] })).toBe(false);
  });
});

describe('statusToFlags / flagsToStatus', () => {
  it('maps drafts to onlyDrafts flag', () => {
    expect(statusToFlags('drafts')).toEqual({ onlyDrafts: true });
  });

  it('maps projects to projectsOnly flag', () => {
    expect(statusToFlags('projects')).toEqual({ projectsOnly: true });
  });

  it('maps any to empty flags', () => {
    expect(statusToFlags('any')).toEqual({});
  });

  it('maps established to empty flags', () => {
    expect(statusToFlags('established')).toEqual({});
  });

  it.each<StatusFilter>(['drafts', 'projects', 'any'])('roundtrips %s through flags', (status) => {
    expect(flagsToStatus(statusToFlags(status))).toBe(status);
  });

  it('flagsToStatus returns any for empty flags', () => {
    expect(flagsToStatus({})).toBe('any');
  });

  it('flagsToStatus prefers drafts when both flags set', () => {
    expect(flagsToStatus({ onlyDrafts: true, projectsOnly: true })).toBe('drafts');
  });
});

describe('toClimbSearchInput', () => {
  it('produces a minimal search input for the default state', () => {
    expect(toClimbSearchInput(DEFAULT_CLIMB_FILTER_STATE, board, pagination)).toEqual({
      boardName: 'kilter',
      layoutId: 1,
      sizeId: 10,
      setIds: '1,20',
      angle: 40,
      page: 0,
      pageSize: 30,
      sortBy: 'ascents',
      sortOrder: 'desc',
    });
  });

  it('copies defined optional fields onto the input', () => {
    const state: ClimbFilterState = {
      ...DEFAULT_CLIMB_FILTER_STATE,
      minGrade: 10,
      maxGrade: 20,
      minAscents: 5,
      minRating: 3,
      gradeAccuracy: '0.1',
      onlyTallClimbs: true,
      onlyWideClimbs: true,
      hideAttempted: true,
      hideCompleted: true,
      showOnlyAttempted: true,
      showOnlyCompleted: true,
    };

    const result = toClimbSearchInput(state, board, pagination);

    expect(result).toMatchObject({
      minGrade: 10,
      maxGrade: 20,
      minAscents: 5,
      minRating: 3,
      gradeAccuracy: '0.1',
      onlyTallClimbs: true,
      onlyWideClimbs: true,
      hideAttempted: true,
      hideCompleted: true,
      showOnlyAttempted: true,
      showOnlyCompleted: true,
    });
  });

  it('maps status=drafts to onlyDrafts', () => {
    const result = toClimbSearchInput({ ...DEFAULT_CLIMB_FILTER_STATE, status: 'drafts' }, board, pagination);
    expect(result.onlyDrafts).toBe(true);
    expect(result.projectsOnly).toBeUndefined();
  });

  it('maps status=projects to projectsOnly', () => {
    const result = toClimbSearchInput({ ...DEFAULT_CLIMB_FILTER_STATE, status: 'projects' }, board, pagination);
    expect(result.projectsOnly).toBe(true);
    expect(result.onlyDrafts).toBeUndefined();
  });

  it('omits status flags for status=any and status=established', () => {
    const anyResult = toClimbSearchInput(DEFAULT_CLIMB_FILTER_STATE, board, pagination);
    expect(anyResult.onlyDrafts).toBeUndefined();
    expect(anyResult.projectsOnly).toBeUndefined();

    const establishedResult = toClimbSearchInput(
      { ...DEFAULT_CLIMB_FILTER_STATE, status: 'established' },
      board,
      pagination,
    );
    expect(establishedResult.onlyDrafts).toBeUndefined();
    expect(establishedResult.projectsOnly).toBeUndefined();
  });

  it('passes setter array when non-empty', () => {
    const result = toClimbSearchInput({ ...DEFAULT_CLIMB_FILTER_STATE, setter: ['alice', 'bob'] }, board, pagination);
    expect(result.setter).toEqual(['alice', 'bob']);
  });

  it('omits setter when array is empty', () => {
    const result = toClimbSearchInput({ ...DEFAULT_CLIMB_FILTER_STATE, setter: [] }, board, pagination);
    expect(result.setter).toBeUndefined();
  });

  it('includes name when provided in options', () => {
    const result = toClimbSearchInput(DEFAULT_CLIMB_FILTER_STATE, board, pagination, { name: 'crimp' });
    expect(result.name).toBe('crimp');
  });

  it('omits name when options.name is empty string', () => {
    const result = toClimbSearchInput(DEFAULT_CLIMB_FILTER_STATE, board, pagination, { name: '' });
    expect(result.name).toBeUndefined();
  });

  it('omits name when options is undefined', () => {
    const result = toClimbSearchInput(DEFAULT_CLIMB_FILTER_STATE, board, pagination);
    expect(result.name).toBeUndefined();
  });

  it('preserves board and pagination fields verbatim', () => {
    const result = toClimbSearchInput(DEFAULT_CLIMB_FILTER_STATE, board, { page: 3, pageSize: 100 });
    expect(result.boardName).toBe('kilter');
    expect(result.layoutId).toBe(1);
    expect(result.sizeId).toBe(10);
    expect(result.setIds).toBe('1,20');
    expect(result.angle).toBe(40);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(100);
  });
});
