import { describe, it, expect, vi } from 'vitest';

// Mock the haptics module so importing SegmentedControl.logic never pulls in
// react-native (its only transitive dependency) under the node test env, and so
// we can assert the haptic fires — including via makeSelectHandler's default.
const hapticSelectionMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/haptics', () => ({ hapticSelection: hapticSelectionMock }));

import { makeSelectHandler } from '../SegmentedControl.logic';

// The SegmentedControl render path is native @expo/ui (SwiftUI segmented Picker /
// Compose SingleChoiceSegmentedButtonRow) and is exercised in screen tests via the
// passthrough stub (test/segmented-control-stub.tsx, wired through the vite alias).
// The selection behaviour both platforms share lives in makeSelectHandler, which is
// what we unit-test here.
describe('makeSelectHandler', () => {
  it('fires the haptic then onSelect with the chosen key', () => {
    const haptic = vi.fn();
    const onSelect = vi.fn();

    makeSelectHandler(onSelect, undefined, haptic)('b');

    expect(haptic).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('selects a key not present in disabledKeys', () => {
    const haptic = vi.fn();
    const onSelect = vi.fn();

    makeSelectHandler(onSelect, new Set(['b']), haptic)('a');

    expect(haptic).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('is a no-op for a disabled key — no haptic, no callback', () => {
    const haptic = vi.fn();
    const onSelect = vi.fn();

    makeSelectHandler(onSelect, new Set(['b']), haptic)('b');

    expect(haptic).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('defaults the haptic to hapticSelection', () => {
    hapticSelectionMock.mockClear();
    const onSelect = vi.fn();

    makeSelectHandler(onSelect)('a');

    expect(hapticSelectionMock).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});
