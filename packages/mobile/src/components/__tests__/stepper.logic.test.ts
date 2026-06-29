import { describe, it, expect } from 'vitest';
import { clampStepperValue, nextHoldDelay, HOLD_INITIAL_DELAY_MS, HOLD_MIN_DELAY_MS } from '../Stepper.logic';

describe('clampStepperValue', () => {
  it('returns the value unchanged when within range', () => {
    expect(clampStepperValue(5, 1, 10)).toBe(5);
  });

  it('clamps to min when below range', () => {
    expect(clampStepperValue(0, 1, 10)).toBe(1);
  });

  it('clamps to max when above range', () => {
    expect(clampStepperValue(11, 1, 10)).toBe(10);
  });

  it('returns the bound when the value sits exactly on it', () => {
    expect(clampStepperValue(1, 1, 10)).toBe(1);
    expect(clampStepperValue(10, 1, 10)).toBe(10);
  });

  it('clamps an increment that would overshoot the max', () => {
    expect(clampStepperValue(10 + 1, 1, 10)).toBe(10);
  });

  it('clamps a decrement that would undershoot the min', () => {
    expect(clampStepperValue(1 - 1, 1, 10)).toBe(1);
  });
});

describe('nextHoldDelay', () => {
  it('shortens the interval on each repeat (acceleration)', () => {
    const second = nextHoldDelay(HOLD_INITIAL_DELAY_MS);
    expect(second).toBeLessThan(HOLD_INITIAL_DELAY_MS);
  });

  it('floors at HOLD_MIN_DELAY_MS no matter how long the hold runs', () => {
    let delay = HOLD_INITIAL_DELAY_MS;
    for (let i = 0; i < 50; i += 1) delay = nextHoldDelay(delay);
    expect(delay).toBe(HOLD_MIN_DELAY_MS);
  });

  it('never returns below the floor', () => {
    expect(nextHoldDelay(HOLD_MIN_DELAY_MS)).toBe(HOLD_MIN_DELAY_MS);
  });
});
