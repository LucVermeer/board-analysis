import { TAB_BAR_HEIGHT, TOOLBAR_GAP_ABOVE_TABBAR, TOOLBAR_RESERVE, glassSize } from '../theme/layout';

/**
 * Inputs the React hook gathers (safe-area insets, route, queue, capability)
 * reduced to the primitives the math needs. Kept separate from
 * {@link import('./use-bottom-chrome-metrics').useBottomChromeMetrics} so the
 * arbitration is a pure, unit-tested function: it decides whether the last list
 * row, the queue-added snackbar, and the filter FAB clear the tab bar /
 * accessory — a class of bug that is invisible in code review and only shows on
 * device. (Replaces the unit-tested pure `queueSnackbarBottomOffset` that was
 * folded into the hook.)
 */
export type BottomChromeInputs = {
  /** Bottom safe-area inset. */
  insetsBottom: number;
  /** Whether the current route is inside the (tabs) group (tab bar present). */
  insideTabs: boolean;
  /** Whether a climb is currently set (drives the toolbar / accessory). */
  hasCurrentClimb: boolean;
  /** Whether the iOS 26 native bottom accessory is mounted (it replaces the JS toolbar). */
  nativeAccessoryMounted: boolean;
};

export type BottomChromeMetrics = {
  hasCurrentClimb: boolean;
  insideTabs: boolean;
  nativeAccessoryMounted: boolean;
  nativeAccessoryVisible: boolean;
  jsQueueToolbarVisible: boolean;
  tabBarHeight: number;
  tabBarBottom: number;
  jsQueueReserve: number;
  nativeAccessoryReserve: number;
  /** Bottom padding for scroll views so the last row clears the tab bar + JS toolbar. */
  scrollBottomPadding: number;
  /** Bottom offset for floating controls (FABs, snackbar) so they clear all chrome. */
  floatingControlBottom: number;
};

/**
 * Pure bottom-chrome arbitration. `nativeAccessoryVisible` and
 * `jsQueueToolbarVisible` are mutually exclusive (the JS toolbar only mounts
 * when the native accessory does not). The native accessory is UIKit-owned and
 * adds its own content inset, so `scrollBottomPadding` reserves only for the JS
 * toolbar; `floatingControlBottom` takes the max of the two reserves so floating
 * controls clear whichever chrome is present.
 */
export function computeBottomChromeMetrics({
  insetsBottom,
  insideTabs,
  hasCurrentClimb,
  nativeAccessoryMounted,
}: BottomChromeInputs): BottomChromeMetrics {
  const nativeAccessoryVisible = nativeAccessoryMounted && hasCurrentClimb;
  const jsQueueToolbarVisible = hasCurrentClimb && !nativeAccessoryMounted;
  const tabBarHeight = insideTabs ? TAB_BAR_HEIGHT : 0;
  const jsQueueReserve = jsQueueToolbarVisible ? TOOLBAR_RESERVE : 0;
  const nativeAccessoryReserve = nativeAccessoryVisible ? glassSize.standard + TOOLBAR_GAP_ABOVE_TABBAR : 0;

  return {
    hasCurrentClimb,
    insideTabs,
    nativeAccessoryMounted,
    nativeAccessoryVisible,
    jsQueueToolbarVisible,
    tabBarHeight,
    tabBarBottom: insetsBottom + tabBarHeight,
    jsQueueReserve,
    nativeAccessoryReserve,
    scrollBottomPadding: insetsBottom + tabBarHeight + jsQueueReserve,
    floatingControlBottom: insetsBottom + tabBarHeight + Math.max(jsQueueReserve, nativeAccessoryReserve),
  };
}
