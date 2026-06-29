import { describe, it, expect } from 'vitest';
import { clampStepperValue } from '../Stepper.logic';

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
