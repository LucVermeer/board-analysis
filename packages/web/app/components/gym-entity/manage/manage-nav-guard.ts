// Pure decision logic for the manage-gym shell's unsaved-changes guard: given
// the active tab's dirty flag and an intended navigation, either proceed
// immediately or hold the navigation behind a discard confirmation. Kept out
// of the shell component so the guard contract is unit-testable.

/** A navigation the shell can perform away from the active tab's edits. */
export type ManageNavigation = { kind: 'tab'; tab: string } | { kind: 'href'; href: string };

export type ManageNavigationDecision =
  | { action: 'proceed'; navigation: ManageNavigation }
  | { action: 'confirm'; pending: ManageNavigation };

/**
 * Route an intended navigation through the dirty guard. Clean tab → proceed;
 * dirty tab → hold it as `pending` for the ConfirmDialog (the shell navigates
 * on confirm and drops it on cancel).
 */
export function decideManageNavigation(
  isActiveTabDirty: boolean,
  navigation: ManageNavigation,
): ManageNavigationDecision {
  if (!isActiveTabDirty) {
    return { action: 'proceed', navigation };
  }
  return { action: 'confirm', pending: navigation };
}
