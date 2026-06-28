import { describe, expect, it, vi } from 'vitest';

// Mock the haptics module so importing AngleSlider.logic never pulls in
// react-native (its only transitive dependency, via lib/haptics) under the node
// test env, and so we can assert the default haptic fires.
const hapticSelectionMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/haptics', () => ({ hapticSelection: hapticSelectionMock }));

import {
  angleForSliderValue,
  clampIndex,
  makeAngleSliderHandler,
  sliderIndexForAngle,
  snappedIndexForSliderValue,
} from '../AngleSlider.logic';

// A non-uniform 2-value set (MoonBoard) and a uniform set (Kilter 5° steps).
const MOONBOARD = [25, 40];
const KILTER = [20, 25, 30, 35, 40, 45];
// A single-stop set: every slider value clamps to the one index, and the one
// angle is always emitted.
const SINGLE = [25];

describe('clampIndex', () => {
  it('clamps into [0, count - 1]', () => {
    expect(clampIndex(-3, 6)).toBe(0);
    expect(clampIndex(0, 6)).toBe(0);
    expect(clampIndex(4, 6)).toBe(4);
    expect(clampIndex(99, 6)).toBe(5);
  });

  it('returns 0 for an empty set', () => {
    expect(clampIndex(2, 0)).toBe(0);
  });
});

describe('sliderIndexForAngle', () => {
  it('returns the index of the value in the set', () => {
    expect(sliderIndexForAngle(KILTER, 20)).toBe(0);
    expect(sliderIndexForAngle(KILTER, 40)).toBe(4);
    expect(sliderIndexForAngle(MOONBOARD, 40)).toBe(1);
  });

  it('falls back to index 0 when the value is not in the set', () => {
    expect(sliderIndexForAngle(KILTER, 999)).toBe(0);
    expect(sliderIndexForAngle(MOONBOARD, 30)).toBe(0);
  });
});

describe('snappedIndexForSliderValue', () => {
  it('rounds a continuous slider value to the nearest stop index and clamps', () => {
    expect(snappedIndexForSliderValue(KILTER, 0)).toBe(0);
    expect(snappedIndexForSliderValue(KILTER, 2.4)).toBe(2);
    expect(snappedIndexForSliderValue(KILTER, 2.6)).toBe(3);
    expect(snappedIndexForSliderValue(KILTER, 99)).toBe(5);
    expect(snappedIndexForSliderValue(KILTER, -5)).toBe(0);
  });

  it('handles the 2-value set (continuous Android drag rounds to a real stop)', () => {
    expect(snappedIndexForSliderValue(MOONBOARD, 0.49)).toBe(0);
    expect(snappedIndexForSliderValue(MOONBOARD, 0.5)).toBe(1);
    expect(snappedIndexForSliderValue(MOONBOARD, 1)).toBe(1);
  });
});

describe('angleForSliderValue', () => {
  it('maps a slider value back to a real angle from the set', () => {
    expect(angleForSliderValue(KILTER, 0)).toBe(20);
    expect(angleForSliderValue(KILTER, 2.6)).toBe(35);
    expect(angleForSliderValue(MOONBOARD, 0.4)).toBe(25);
    expect(angleForSliderValue(MOONBOARD, 0.6)).toBe(40);
  });

  it('returns undefined only for an empty set', () => {
    expect(angleForSliderValue([], 0)).toBeUndefined();
  });

  it('always maps to the one angle for a single-stop set', () => {
    expect(sliderIndexForAngle(SINGLE, 25)).toBe(0);
    expect(sliderIndexForAngle(SINGLE, 99)).toBe(0);
    expect(snappedIndexForSliderValue(SINGLE, 0)).toBe(0);
    expect(snappedIndexForSliderValue(SINGLE, 0.9)).toBe(0);
    expect(angleForSliderValue(SINGLE, 0)).toBe(25);
  });
});

describe('makeAngleSliderHandler', () => {
  it('emits the snapped angle and fires a haptic when the index changes', () => {
    const onChange = vi.fn();
    const haptic = vi.fn();
    // Current index 0 (angle 20). Drag to ~index 2.
    const handle = makeAngleSliderHandler(KILTER, 0, onChange, haptic);
    handle(2.4);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(30);
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the snapped index equals the current index (no churn, no haptic)', () => {
    const onChange = vi.fn();
    const haptic = vi.fn();
    const handle = makeAngleSliderHandler(KILTER, 2, onChange, haptic);
    handle(2.1);
    expect(onChange).not.toHaveBeenCalled();
    expect(haptic).not.toHaveBeenCalled();
  });

  it('never emits an off-stop angle for an empty set', () => {
    const onChange = vi.fn();
    const haptic = vi.fn();
    const handle = makeAngleSliderHandler([], 0, onChange, haptic);
    handle(1.5);
    expect(onChange).not.toHaveBeenCalled();
    expect(haptic).not.toHaveBeenCalled();
  });

  it('defaults the haptic to hapticSelection', () => {
    hapticSelectionMock.mockClear();
    const onChange = vi.fn();
    makeAngleSliderHandler(KILTER, 0, onChange)(1);
    expect(hapticSelectionMock).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(25);
  });
});
