import { describe, it, expect } from 'vitest';
import { clampStepperValue, composeStepperLabel } from '../Stepper.logic';

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

describe('composeStepperLabel', () => {
  it('folds the value onto the end of the label', () => {
    expect(composeStepperLabel('Number of climbs', 5)).toBe('Number of climbs   5');
  });

  it('keeps the value visually separated from the label text', () => {
    // The value is a distinct trailing token, never glued to the label.
    expect(composeStepperLabel('Steps', 12)).not.toBe('Steps12');
    expect(composeStepperLabel('Steps', 12).endsWith('12')).toBe(true);
    expect(composeStepperLabel('Steps', 12).startsWith('Steps')).toBe(true);
  });
});
