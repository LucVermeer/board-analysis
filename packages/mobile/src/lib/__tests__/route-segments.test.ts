import { describe, it, expect } from 'vitest';
import { isTabsRoute, isClimbsTabRoute, isTopLevelTabRoute, isAccessorySurfaceRoute } from '../route-segments';

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

describe('isTopLevelTabRoute', () => {
  it('is true on a tab index (≤ 2 segments deep under (tabs))', () => {
    expect(isTopLevelTabRoute(['(tabs)'])).toBe(true);
    expect(isTopLevelTabRoute(['(tabs)', 'home'])).toBe(true);
    expect(isTopLevelTabRoute(['(tabs)', 'climbs'])).toBe(true);
    expect(isTopLevelTabRoute(['(tabs)', 'profile'])).toBe(true);
  });

  it('is false on a pushed sub-route inside a tab (≥ 3 segments)', () => {
    expect(isTopLevelTabRoute(['(tabs)', 'climbs', 'create'])).toBe(false);
    expect(isTopLevelTabRoute(['(tabs)', 'climbs', '[climbUuid]'])).toBe(false);
    expect(isTopLevelTabRoute(['(tabs)', 'home', 'session', '[sessionId]'])).toBe(false);
    expect(isTopLevelTabRoute(['(tabs)', 'profile', 'more'])).toBe(false);
  });

  it('is false outside the tabs group', () => {
    expect(isTopLevelTabRoute(['play'])).toBe(false);
    expect(isTopLevelTabRoute(['gyms'])).toBe(false);
    expect(isTopLevelTabRoute(['auth', 'login'])).toBe(false);
    expect(isTopLevelTabRoute([])).toBe(false);
  });

  it('is false on the create-board / edit-board screens (regression test for #3298)', () => {
    // `boards` is a root Stack.Screen (app/_layout.tsx), not nested under `(tabs)`,
    // so its create/edit screens must never be treated as a top-level tab page.
    // Before #3253's allow-list rewrite, the accessory bar's route gate was a
    // deny-list (auth/gyms/player only) that let it fall through and show here,
    // overlapping BoardForm's pinned submit button (#3298).
    expect(isTopLevelTabRoute(['boards', 'create'])).toBe(false);
    expect(isTopLevelTabRoute(['boards', 'edit'])).toBe(false);
  });
});

describe('isAccessorySurfaceRoute', () => {
  it('is true on a top-level tab page and under the player', () => {
    expect(isAccessorySurfaceRoute(['(tabs)', 'home'])).toBe(true);
    expect(isAccessorySurfaceRoute(['(tabs)', 'climbs'])).toBe(true);
    // Kept mounted (occluded) under the transparent player to avoid tab-bar churn.
    expect(isAccessorySurfaceRoute(['play'])).toBe(true);
  });

  it('is false on tab sub-routes and other root surfaces', () => {
    expect(isAccessorySurfaceRoute(['(tabs)', 'climbs', 'create'])).toBe(false);
    expect(isAccessorySurfaceRoute(['(tabs)', 'home', 'session', '[sessionId]'])).toBe(false);
    expect(isAccessorySurfaceRoute(['gyms'])).toBe(false);
    expect(isAccessorySurfaceRoute(['auth', 'login'])).toBe(false);
    expect(isAccessorySurfaceRoute([])).toBe(false);
  });

  it('is false on the create-board / edit-board screens (regression test for #3298)', () => {
    // Pins the JS PersistentQueueBar's mount gate off the create/edit board
    // screens — see the isTopLevelTabRoute case above for the full context.
    expect(isAccessorySurfaceRoute(['boards', 'create'])).toBe(false);
    expect(isAccessorySurfaceRoute(['boards', 'edit'])).toBe(false);
  });
});
