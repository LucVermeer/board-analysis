import { describe, it, expect } from 'vitest';
import type { TickStatus } from '@boardsesh/shared-schema';
import { clampAttempts, createInitialTickState, deriveAscentType, MIN_ATTEMPT_COUNT } from '../quick-tick-state';

// Highest tries value worth walking in the loops below. The picker's plus
// button is unbounded, so this is a sample, not a limit.
const SAMPLED_TRIES = [1, 2, 3, 4, 5, 8, 12, 99];

describe('deriveAscentType', () => {
  it('is a flash only on a first-ever go', () => {
    expect(deriveAscentType(false, 1)).toBe('flash');
  });

  it('is a send once the climber has touched the climb before, even first go this session', () => {
    expect(deriveAscentType(true, 1)).toBe('send');
  });

  it('is a send once it took more than one go, with no prior history', () => {
    expect(deriveAscentType(false, 2)).toBe('send');
  });
});

describe('clampAttempts', () => {
  it('lets a redpoint that went first go this session stay at one try', () => {
    // The regression this file exists for: this returned 2 while the picker
    // showed 1, so every send of a climb the climber had touched before was
    // written to the logbook with a try they never made. Issue #2888.
    expect(clampAttempts(1, 'send')).toBe(1);
  });

  it('pins a flash to exactly one try, matching the server refine', () => {
    expect(clampAttempts(4, 'flash')).toBe(1);
  });

  it('floors a missing or nonsense count at one try', () => {
    expect(clampAttempts(0, 'send')).toBe(MIN_ATTEMPT_COUNT);
    expect(clampAttempts(-3, 'attempt')).toBe(MIN_ATTEMPT_COUNT);
  });

  it('leaves a real multi-go count alone', () => {
    expect(clampAttempts(7, 'send')).toBe(7);
    expect(clampAttempts(7, 'attempt')).toBe(7);
  });
});

// The contract that makes the bug structurally impossible rather than merely
// fixed. It is stated against clampAttempts + deriveAscentType alone, with no
// reference to any component, so it holds for whatever tries picker ships next:
// a picker that floors at MIN_ATTEMPT_COUNT can never display a number the save
// path would rewrite. Reintroducing a status-dependent floor above 1 fails here
// before it can reach a logbook.
describe('displayed tries === saved tries', () => {
  it('never rewrites a value the picker can show, for any ascent-button status', () => {
    for (const hasPriorHistory of [false, true]) {
      for (const displayedTries of SAMPLED_TRIES) {
        const status = deriveAscentType(hasPriorHistory, displayedTries);
        expect({ hasPriorHistory, displayedTries, saved: clampAttempts(displayedTries, status) }).toEqual({
          hasPriorHistory,
          displayedTries,
          saved: displayedTries,
        });
      }
    }
  });

  it('never rewrites a value the picker can show when the climber logs an attempt instead', () => {
    for (const displayedTries of SAMPLED_TRIES) {
      expect(clampAttempts(displayedTries, 'attempt')).toBe(displayedTries);
    }
  });

  it('opens the form on a value the save path agrees with', () => {
    const { attemptCount } = createInitialTickState();
    expect(attemptCount).toBe(MIN_ATTEMPT_COUNT);
    for (const status of ['flash', 'send', 'attempt'] satisfies TickStatus[]) {
      expect(clampAttempts(attemptCount, status)).toBe(attemptCount);
    }
  });
});
