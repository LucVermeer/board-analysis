import type { UiVariant } from '../theme/resolve-ui-variant';
import {
  MATERIAL_ACTIVE_CONTEXT_BAR_HEIGHT,
  TAB_BAR_HEIGHT,
  TOOLBAR_GAP_ABOVE_TABBAR,
  TOOLBAR_RESERVE,
  glassSize,
} from '../theme/layout';

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
  /** Resolved UI variant; controls the JS toolbar shape/reserve. */
  uiVariant: UiVariant;
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
  /**
   * Bottom padding for fixed footers. NativeTabs overlays content, so fixed
   * footers clear the tab bar there. Material JS tabs are in flow, so fixed
   * footers clear only active queue/accessory chrome.
   */
  fixedFooterBottom: number;
};

/**
 * Pure bottom-chrome arbitration. `nativeAccessoryVisible` and
 * `jsQueueToolbarVisible` are mutually exclusive (the JS toolbar only mounts
 * when the native accessory does not). The native accessory is UIKit-owned and
 * adds its own content inset, so `scrollBottomPadding` reserves only for the JS
 * toolbar. Liquid Glass reserves the taller floating island stack; Material
 * reserves the docked active-context bar height. `scrollBottomPadding` remains
 * conservative for list/scroll consumers and keeps tab-bar clearance on both
 * tab implementations; fixed footers use `fixedFooterBottom` because they need
 * the in-flow-vs-overlay tab-bar distinction. `floatingControlBottom` clears
 * the physical tab bar because those controls are absolute overlays.
 */
export function computeBottomChromeMetrics({
  uiVariant,
  insetsBottom,
  insideTabs,
  hasCurrentClimb,
  nativeAccessoryMounted,
}: BottomChromeInputs): BottomChromeMetrics {
  const nativeAccessoryVisible = nativeAccessoryMounted && hasCurrentClimb;
  const jsQueueToolbarVisible = hasCurrentClimb && !nativeAccessoryMounted;
  const tabBarHeight = insideTabs ? TAB_BAR_HEIGHT : 0;
  const tabBarOverlaysContent = insideTabs && uiVariant !== 'material';
  // The Material bar reserves its full height even though it's tucked ~2px into the
  // tab bar (MATERIAL_TABBAR_OVERLAP in persistent-queue-bar), so its visible height
  // above the tab bar is ~2px less. The resulting 2px of extra scroll padding is
  // intentional slack — imperceptible, and not worth threading the overlap through
  // this pure arbitration. Don't "fix" it by subtracting the overlap here.
  const jsQueueToolbarReserve = uiVariant === 'material' ? MATERIAL_ACTIVE_CONTEXT_BAR_HEIGHT : TOOLBAR_RESERVE;
  const jsQueueReserve = jsQueueToolbarVisible ? jsQueueToolbarReserve : 0;
  const nativeAccessoryReserve = nativeAccessoryVisible ? glassSize.standard + TOOLBAR_GAP_ABOVE_TABBAR : 0;
  const tabBarBottom = insetsBottom + tabBarHeight;
  const activeQueueChromeReserve = Math.max(jsQueueReserve, nativeAccessoryReserve);
  const contentInsetBottom = tabBarOverlaysContent || !insideTabs ? tabBarBottom : 0;
  const fixedFooterBottom = contentInsetBottom + activeQueueChromeReserve;

  return {
    hasCurrentClimb,
    insideTabs,
    nativeAccessoryMounted,
    nativeAccessoryVisible,
    jsQueueToolbarVisible,
    tabBarHeight,
    tabBarBottom,
    jsQueueReserve,
    nativeAccessoryReserve,
    scrollBottomPadding: insetsBottom + tabBarHeight + jsQueueReserve,
    floatingControlBottom: insetsBottom + tabBarHeight + Math.max(jsQueueReserve, nativeAccessoryReserve),
    fixedFooterBottom,
  };
}
