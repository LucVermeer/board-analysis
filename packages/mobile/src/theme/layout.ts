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

/**
 * One height ladder for every glass FAB / capsule / pill, so the floating chrome
 * reads as a single, deliberately-sized system rather than a pile of ad-hoc
 * diameters. Liquid Glass earns expressiveness from a single hero bump plus a
 * 4pt capsule offset — not from many sizes — so the ladder is capped and every
 * interactive tier stays at or above the 44pt touch floor.
 *
 *   hero          one defining action per floating surface (log-ascent, create)
 *   standard      default floating FAB
 *   capsule       standalone floating capsule — 4pt under its sibling FABs
 *   inlinePrimary primary action inside a sheet (PlayDrawer)
 *   inline        standard inline control + touch-target floor
 *   mini          label-only pill (angle); carries 44pt hit-slop when tappable
 *
 * Guardrail: the hero bump and the capsule offset are for STANDALONE glass
 * bodies. Anything merged inside a GlassContainer shares one height.
 */
export const glassSize = {
  hero: 64,
  standard: 56,
  capsule: 52,
  inlinePrimary: 48,
  inline: 44,
  mini: 32,
} as const;

/** Diameter of the floating toolbar's standard circular FABs (search).
 *  The log-ascent hero FAB is `glassSize.hero`; see `glassSize`. */
export const TOOLBAR_FAB_SIZE = glassSize.standard;

/** Height of the centered climb capsule — one step under the flanking FABs so it
 *  reads as context, not an action (the playful tell). See `glassSize`. */
export const TOOLBAR_CAPSULE_HEIGHT = glassSize.capsule;

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
 *  last scrollable row clears the floating toolbar. Keyed off the tallest island
 *  (the hero log-ascent FAB), not the shorter capsule, so nothing hides under it. */
export const TOOLBAR_RESERVE = glassSize.hero + TOOLBAR_GAP_ABOVE_TABBAR;
