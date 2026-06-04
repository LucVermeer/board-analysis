import { describe, it, expect } from 'vitest';
import { isTabsRoute, isClimbsTabRoute } from '../route-segments';

describe('isTabsRoute', () => {
  it('is true anywhere inside the tab navigator', () => {
    expect(isTabsRoute(['(tabs)'])).toBe(true);
    expect(isTabsRoute(['(tabs)', 'climbs'])).toBe(true);
    expect(isTabsRoute(['(tabs)', 'profile'])).toBe(true);
  });

  it('is false outside the tab navigator', () => {
    expect(isTabsRoute(['auth'])).toBe(false);
    expect(isTabsRoute(['(modal)', 'session'])).toBe(false);
    expect(isTabsRoute([])).toBe(false);
  });
});

describe('isClimbsTabRoute', () => {
  it('is true on the Climbs tab and its sub-routes', () => {
    expect(isClimbsTabRoute(['(tabs)', 'climbs'])).toBe(true);
    expect(isClimbsTabRoute(['(tabs)', 'climbs', 'create'])).toBe(true);
  });

  it('is false on other tabs or outside the tabs group', () => {
    expect(isClimbsTabRoute(['(tabs)', 'boards'])).toBe(false);
    expect(isClimbsTabRoute(['(tabs)'])).toBe(false);
    expect(isClimbsTabRoute(['auth'])).toBe(false);
    expect(isClimbsTabRoute([])).toBe(false);
  });
});
