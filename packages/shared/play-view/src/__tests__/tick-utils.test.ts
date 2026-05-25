import { describe, it, expect } from 'vitest';
import { hasPriorHistoryForClimb, computeTickType } from '../tick-utils';
import type { ClimbWithAscents, LogbookEntryLike } from '../tick-utils';

describe('hasPriorHistoryForClimb', () => {
  it('returns false when there is no history', () => {
    const climb: ClimbWithAscents = { uuid: 'climb-1' };
    expect(hasPriorHistoryForClimb(climb, [])).toBe(false);
  });

  it('returns true when userAscents is positive', () => {
    const climb: ClimbWithAscents = { uuid: 'climb-1', userAscents: 2 };
    expect(hasPriorHistoryForClimb(climb, [])).toBe(true);
  });

  it('returns true when userAttempts is positive', () => {
    const climb: ClimbWithAscents = { uuid: 'climb-1', userAttempts: 3 };
    expect(hasPriorHistoryForClimb(climb, [])).toBe(true);
  });

  it('returns false when userAscents and userAttempts are both zero', () => {
    const climb: ClimbWithAscents = { uuid: 'climb-1', userAscents: 0, userAttempts: 0 };
    expect(hasPriorHistoryForClimb(climb, [])).toBe(false);
  });

  it('returns true when logbook contains a matching entry', () => {
    const climb: ClimbWithAscents = { uuid: 'climb-1' };
    const logbook: LogbookEntryLike[] = [{ climb_uuid: 'climb-other' }, { climb_uuid: 'climb-1' }];
    expect(hasPriorHistoryForClimb(climb, logbook)).toBe(true);
  });

  it('returns false when logbook has no matching entry', () => {
    const climb: ClimbWithAscents = { uuid: 'climb-1' };
    const logbook: LogbookEntryLike[] = [{ climb_uuid: 'climb-other' }];
    expect(hasPriorHistoryForClimb(climb, logbook)).toBe(false);
  });

  it('prefers server-side counts over logbook scan', () => {
    // userAscents is 0 and userAttempts is 0, so it returns false
    // even though the logbook has a match — server counts take priority
    const climb: ClimbWithAscents = { uuid: 'climb-1', userAscents: 0, userAttempts: 0 };
    const logbook: LogbookEntryLike[] = [{ climb_uuid: 'climb-1' }];
    expect(hasPriorHistoryForClimb(climb, logbook)).toBe(false);
  });
});

describe('computeTickType', () => {
  it('returns flash for first attempt with no prior history', () => {
    expect(computeTickType(false, 1)).toBe('flash');
  });

  it('returns send for multiple attempts with no prior history', () => {
    expect(computeTickType(false, 2)).toBe('send');
  });

  it('returns send for first attempt with prior history', () => {
    expect(computeTickType(true, 1)).toBe('send');
  });

  it('returns send for multiple attempts with prior history', () => {
    expect(computeTickType(true, 5)).toBe('send');
  });
});
