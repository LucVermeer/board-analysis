/**
 * Shared layout metrics for chrome that floats over scrollable content.
 *
 * Screens reserve `BAR_CONTENT_HEIGHT + TAB_BAR_HEIGHT + insets.bottom` of
 * bottom padding so their last row clears the persistent queue mini-player and
 * the bottom tab bar. Owned here (rather than inside the queue-control / tab-bar
 * components) so any screen can pad correctly without importing those
 * components' internals.
 */

/** Bottom tab bar height (excludes the safe-area inset). */
export const TAB_BAR_HEIGHT = 49;

/** Persistent queue mini-player content height (excludes the safe-area inset). */
export const BAR_CONTENT_HEIGHT = 56;
