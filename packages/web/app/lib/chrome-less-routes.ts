// Routes that render ZERO app chrome — no GlobalHeader, no bottom bar, no
// banners. The root layout mounts that chrome unconditionally (a nested layout
// cannot remove it), so the chrome components themselves gate on these
// prefixes via `usePathnameWithoutLocale()` (locale-prefix aware: /es/kiosk/…
// arrives here already stripped to /kiosk/…).
//
// - /kiosk — public smart-TV surfaces: full-viewport 100dvh grids where any
//   overlaid chrome breaks the no-scroll contract.
// - /embed — iframe embeds (PR G, stacked on the kiosk foundation): embedded
//   third-party pages must never show Boardsesh navigation.

export const CHROME_LESS_ROUTE_PREFIXES = ['/kiosk', '/embed'] as const;

/**
 * Whether a locale-stripped pathname belongs to a chrome-less surface.
 * Boundary-aware prefix match: '/kiosk' and '/kiosk/…' match, '/kiosks' does not.
 */
export function isChromeLessPath(pathnameWithoutLocale: string): boolean {
  return CHROME_LESS_ROUTE_PREFIXES.some(
    (prefix) => pathnameWithoutLocale === prefix || pathnameWithoutLocale.startsWith(`${prefix}/`),
  );
}
