/**
 * Shared layout metrics for chrome that floats over scrollable content.
 *
 * The persistent climb toolbar — a glass capsule (current climb) + a log-ascent
 * FAB, joined on the Climbs tab by a search FAB — floats above the tab bar on
 * every screen while a climb is active. Screens reserve
 * `TOOLBAR_RESERVE + TAB_BAR_HEIGHT + insets.bottom` of bottom padding so their
 * last row clears it. Owned here (rather than inside the queue-control / tab-bar
 * components) so any screen can pad correctly without importing those
 * components' internals.
 */

/** Bottom tab bar height (excludes the safe-area inset). */
export const TAB_BAR_HEIGHT = 49;

/** Diameter of the floating toolbar's circular FABs (search, log-ascent).
 *  Larger than the 44pt HIG minimum — a primary, thumb-friendly action sized
 *  like the iOS Photos / Material FAB so it reads as the obvious target. */
export const TOOLBAR_FAB_SIZE = 56;

/** Height of the centered climb capsule. Matches the FAB diameter so the three
 *  floating elements share one optical baseline. */
export const TOOLBAR_CAPSULE_HEIGHT = 56;

/** Max width of the centered climb capsule so it never collides with the side
 *  FABs and stays Photos-style centered on wide phones. */
export const TOOLBAR_CAPSULE_MAX_WIDTH = 260;

/** Screen-edge gutter for the toolbar's side FABs. Matches ClimbTopChrome. */
export const TOOLBAR_SIDE_MARGIN = 16;

/** Gap between the toolbar's three floating elements. */
export const TOOLBAR_GAP = 8;

/** Lift between the floating toolbar and the tab bar below it, so the islands
 *  read as floating (the old opaque queue bar sat flush against the tab bar). */
export const TOOLBAR_GAP_ABOVE_TABBAR = 10;

/** Bottom padding screens reserve (above the tab bar + safe-area inset) so the
 *  last scrollable row clears the floating toolbar. */
export const TOOLBAR_RESERVE = TOOLBAR_CAPSULE_HEIGHT + TOOLBAR_GAP_ABOVE_TABBAR;
