import { describe, it, expect } from 'vitest';
import { computeBottomChromeMetrics } from '../bottom-chrome-metrics';
import { TAB_BAR_HEIGHT, TOOLBAR_GAP_ABOVE_TABBAR, TOOLBAR_RESERVE, glassSize } from '../../theme/layout';

// Assert the arbitration in terms of the layout constants (not magic numbers) so
// this stays correct when the glass-size ladder is retuned.
const NATIVE_ACCESSORY_RESERVE = glassSize.standard + TOOLBAR_GAP_ABOVE_TABBAR;

describe('computeBottomChromeMetrics', () => {
  it('reserves nothing extra outside the tabs group', () => {
    const metrics = computeBottomChromeMetrics({
      insetsBottom: 34,
      insideTabs: false,
      hasCurrentClimb: false,
      nativeAccessoryMounted: false,
    });
    expect(metrics.tabBarHeight).toBe(0);
    expect(metrics.tabBarBottom).toBe(34);
    expect(metrics.scrollBottomPadding).toBe(34);
    expect(metrics.floatingControlBottom).toBe(34);
    expect(metrics.jsQueueToolbarVisible).toBe(false);
    expect(metrics.nativeAccessoryVisible).toBe(false);
  });

  it('reserves the JS toolbar when a climb is set and the native accessory is unavailable', () => {
    const metrics = computeBottomChromeMetrics({
      insetsBottom: 0,
      insideTabs: true,
      hasCurrentClimb: true,
      nativeAccessoryMounted: false,
    });
    expect(metrics.jsQueueToolbarVisible).toBe(true);
    expect(metrics.jsQueueReserve).toBe(TOOLBAR_RESERVE);
    expect(metrics.scrollBottomPadding).toBe(TAB_BAR_HEIGHT + TOOLBAR_RESERVE);
    expect(metrics.floatingControlBottom).toBe(TAB_BAR_HEIGHT + TOOLBAR_RESERVE);
  });

  it('does not pad scroll content for the UIKit-owned native accessory', () => {
    const metrics = computeBottomChromeMetrics({
      insetsBottom: 0,
      insideTabs: true,
      hasCurrentClimb: true,
      nativeAccessoryMounted: true,
    });
    expect(metrics.nativeAccessoryVisible).toBe(true);
    expect(metrics.jsQueueToolbarVisible).toBe(false);
    expect(metrics.jsQueueReserve).toBe(0);
    // UIKit adds the accessory inset itself, so scroll padding is just the tab bar.
    expect(metrics.scrollBottomPadding).toBe(TAB_BAR_HEIGHT);
    // But floating controls must still clear the accessory.
    expect(metrics.nativeAccessoryReserve).toBe(NATIVE_ACCESSORY_RESERVE);
    expect(metrics.floatingControlBottom).toBe(TAB_BAR_HEIGHT + NATIVE_ACCESSORY_RESERVE);
  });

  it('keeps the tab bar but no toolbar reserve when no climb is set, even if the accessory is mounted', () => {
    const metrics = computeBottomChromeMetrics({
      insetsBottom: 34,
      insideTabs: true,
      hasCurrentClimb: false,
      nativeAccessoryMounted: true,
    });
    expect(metrics.jsQueueToolbarVisible).toBe(false);
    expect(metrics.nativeAccessoryVisible).toBe(false); // mounted, but no climb to show
    expect(metrics.scrollBottomPadding).toBe(34 + TAB_BAR_HEIGHT);
    expect(metrics.floatingControlBottom).toBe(34 + TAB_BAR_HEIGHT);
  });

  it('never reports both the JS toolbar and the native accessory as visible at once', () => {
    for (const hasCurrentClimb of [true, false]) {
      for (const nativeAccessoryMounted of [true, false]) {
        const metrics = computeBottomChromeMetrics({
          insetsBottom: 0,
          insideTabs: true,
          hasCurrentClimb,
          nativeAccessoryMounted,
        });
        expect(metrics.jsQueueToolbarVisible && metrics.nativeAccessoryVisible).toBe(false);
      }
    }
  });
});
