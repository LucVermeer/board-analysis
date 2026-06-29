import { describe, it, expect } from 'vitest';
import { deriveSwitchRowState, isSwitchRowPressable } from '../SwitcherForm.logic';

describe('deriveSwitchRowState', () => {
  const base = { activeTarget: 'production', switchingTarget: null, updatesUsable: true };

  it('marks the live target active', () => {
    expect(deriveSwitchRowState({ ...base, target: 'production' })).toBe('active');
  });

  it('marks the in-flight target switching, even when it is also the active one', () => {
    expect(deriveSwitchRowState({ ...base, target: 'pr-3271', switchingTarget: 'pr-3271' })).toBe('switching');
    // `switching` wins over `active` so a re-switch to the current target still spins.
    expect(deriveSwitchRowState({ ...base, target: 'production', switchingTarget: 'production' })).toBe('switching');
  });

  it('disables every other row while one is switching', () => {
    expect(deriveSwitchRowState({ ...base, target: 'pr-100', switchingTarget: 'pr-3271' })).toBe('disabled');
  });

  it('is pressable when idle, usable, and not the active row', () => {
    expect(deriveSwitchRowState({ ...base, target: 'pr-3271' })).toBe('pressable');
  });

  it('is inert when OTA updates are unusable (dev / Expo Go) and not the active row', () => {
    expect(deriveSwitchRowState({ ...base, target: 'pr-3271', updatesUsable: false })).toBe('inert');
    // The active row still reads as active even when switching is unavailable.
    expect(deriveSwitchRowState({ ...base, target: 'production', updatesUsable: false })).toBe('active');
  });
});

describe('isSwitchRowPressable', () => {
  it('is true only for the pressable state', () => {
    expect(isSwitchRowPressable('pressable')).toBe(true);
    for (const state of ['active', 'switching', 'disabled', 'inert'] as const) {
      expect(isSwitchRowPressable(state)).toBe(false);
    }
  });
});
