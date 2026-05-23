import { describe, it, expect, vi } from 'vitest';

// ── Mock native modules ─────────────────────────────────────────────────

vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn(),
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import {
  hapticSelection,
  hapticLight,
  hapticMedium,
  hapticHeavy,
  hapticSuccess,
  hapticError,
  hapticWarning,
} from '../haptics';

// ── Tests ───────────────────────────────────────────────────────────────

describe('haptics', () => {
  it('exports hapticSelection as a function', () => {
    expect(typeof hapticSelection).toBe('function');
  });

  it('exports hapticLight as a function', () => {
    expect(typeof hapticLight).toBe('function');
  });

  it('exports hapticMedium as a function', () => {
    expect(typeof hapticMedium).toBe('function');
  });

  it('exports hapticHeavy as a function', () => {
    expect(typeof hapticHeavy).toBe('function');
  });

  it('exports hapticSuccess as a function', () => {
    expect(typeof hapticSuccess).toBe('function');
  });

  it('exports hapticError as a function', () => {
    expect(typeof hapticError).toBe('function');
  });

  it('exports hapticWarning as a function', () => {
    expect(typeof hapticWarning).toBe('function');
  });

  it('hapticSelection does not throw', () => {
    expect(() => hapticSelection()).not.toThrow();
  });

  it('hapticLight does not throw', () => {
    expect(() => hapticLight()).not.toThrow();
  });

  it('hapticMedium does not throw', () => {
    expect(() => hapticMedium()).not.toThrow();
  });

  it('hapticHeavy does not throw', () => {
    expect(() => hapticHeavy()).not.toThrow();
  });

  it('hapticSuccess does not throw', () => {
    expect(() => hapticSuccess()).not.toThrow();
  });

  it('hapticError does not throw', () => {
    expect(() => hapticError()).not.toThrow();
  });

  it('hapticWarning does not throw', () => {
    expect(() => hapticWarning()).not.toThrow();
  });
});
