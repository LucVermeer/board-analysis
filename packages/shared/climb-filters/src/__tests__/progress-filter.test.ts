import { describe, it, expect } from 'vitest';
import {
  PROGRESS_FILTER_VALUES,
  progressToFlags,
  flagsToProgress,
  isProgressFilterActive,
  type ProgressFilter,
} from '../progress-filter';

describe('progressToFlags', () => {
  it('maps each value to its tick flags', () => {
    expect(progressToFlags('all')).toEqual({
      hideAttempted: undefined,
      hideCompleted: undefined,
      showOnlyAttempted: undefined,
      showOnlyCompleted: undefined,
    });
    expect(progressToFlags('untried')).toEqual({
      hideAttempted: true,
      hideCompleted: true,
      showOnlyAttempted: undefined,
      showOnlyCompleted: undefined,
    });
    expect(progressToFlags('projects')).toEqual({
      hideAttempted: undefined,
      hideCompleted: true,
      showOnlyAttempted: true,
      showOnlyCompleted: undefined,
    });
    expect(progressToFlags('sent')).toEqual({
      hideAttempted: undefined,
      hideCompleted: undefined,
      showOnlyAttempted: undefined,
      showOnlyCompleted: true,
    });
    expect(progressToFlags('unsent')).toEqual({
      hideAttempted: undefined,
      hideCompleted: true,
      showOnlyAttempted: undefined,
      showOnlyCompleted: undefined,
    });
  });

  it('always returns all four keys so switching clears stale flags', () => {
    // Simulate switching Projects -> Sent over prior state.
    const prior = { ...progressToFlags('projects'), minGrade: 5 };
    const next = { ...prior, ...progressToFlags('sent') };
    expect(next.hideCompleted).toBeUndefined();
    expect(next.showOnlyAttempted).toBeUndefined();
    expect(next.showOnlyCompleted).toBe(true);
    expect(next.minGrade).toBe(5);
  });
});

describe('flagsToProgress', () => {
  it('round-trips every value', () => {
    for (const value of PROGRESS_FILTER_VALUES) {
      expect(flagsToProgress(progressToFlags(value))).toBe(value);
    }
  });

  it('reads an empty/default state as "all"', () => {
    expect(flagsToProgress({})).toBe('all');
  });

  it('distinguishes projects (attempted, not sent) from unsent (hide sent)', () => {
    expect(flagsToProgress({ showOnlyAttempted: true, hideCompleted: true })).toBe('projects');
    expect(flagsToProgress({ hideCompleted: true })).toBe('unsent');
  });

  it('resolves legacy stand-alone "only attempted" to projects', () => {
    expect(flagsToProgress({ showOnlyAttempted: true })).toBe('projects');
  });

  it('prefers sent when completed and attempted flags collide', () => {
    expect(flagsToProgress({ showOnlyCompleted: true, showOnlyAttempted: true })).toBe('sent');
  });

  it('resolves a lone legacy hideAttempted to all (no dedicated lens)', () => {
    expect(flagsToProgress({ hideAttempted: true })).toBe('all');
  });
});

describe('isProgressFilterActive', () => {
  it('is false only for "all"', () => {
    expect(isProgressFilterActive({})).toBe(false);
    const active: ProgressFilter[] = ['untried', 'projects', 'sent', 'unsent'];
    for (const value of active) {
      expect(isProgressFilterActive(progressToFlags(value))).toBe(true);
    }
  });
});
