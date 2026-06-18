/**
 * The board switcher (`/boards`) is a modal opened from a tab. After activating a
 * board it dismisses back to the tab it was opened from, passed as a `returnTo`
 * route param. Allow-list the value so a malformed or deep-linked param can't
 * redirect the user to an unexpected screen, and default to Climbs (the screen
 * the switcher has always returned to). Home is allowed so the onboarding
 * handoff can land a freshly-bound board on the board-scoped Home feed.
 */
export type BoardReturnTo = '/(tabs)/climbs' | '/(tabs)/discover' | '/(tabs)/home';

export function resolveBoardReturnTo(value: string | undefined): BoardReturnTo {
  if (value === '/(tabs)/discover') return '/(tabs)/discover';
  if (value === '/(tabs)/home') return '/(tabs)/home';
  return '/(tabs)/climbs';
}
