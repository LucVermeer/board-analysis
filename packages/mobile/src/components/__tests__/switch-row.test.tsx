import { describe, it, expect, vi } from 'vitest';

// Mock the haptics module so importing SwitchRow.logic never pulls in
// react-native (its only transitive dependency) under the node test env, and so
// we can assert the haptic fires — including via makeToggleHandler's default.
const hapticSelectionMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/haptics', () => ({ hapticSelection: hapticSelectionMock }));

import { makeToggleHandler } from '../SwitchRow.logic';

// The SwitchRow render path is native @expo/ui (SwiftUI Toggle / Compose Switch)
// and is exercised in screen tests via the passthrough stub (test/switch-row-stub.tsx,
// wired through the vite alias). The toggle behaviour both platforms share lives
// in makeToggleHandler, which is what we unit-test here.
describe('makeToggleHandler', () => {
  it('fires the haptic then onValueChange with the next value', () => {
    const haptic = vi.fn();
    const onValueChange = vi.fn();

    makeToggleHandler(onValueChange, false, haptic)(true);

    expect(haptic).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('passes the next value straight through when toggling off', () => {
    const onValueChange = vi.fn();

    makeToggleHandler(onValueChange, false, vi.fn())(false);

    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it('is a no-op when disabled — no haptic, no callback', () => {
    const haptic = vi.fn();
    const onValueChange = vi.fn();

    makeToggleHandler(onValueChange, true, haptic)(true);

    expect(haptic).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('defaults the haptic to hapticSelection', () => {
    hapticSelectionMock.mockClear();
    const onValueChange = vi.fn();

    makeToggleHandler(onValueChange, false)(true);

    expect(hapticSelectionMock).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
