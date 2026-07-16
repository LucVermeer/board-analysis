import { getShareExtensionKey } from 'expo-share-intent';

// Expo Router's redirect hook for OS-level deep links. The iOS Share Extension
// (expo-share-intent) opens the app via a synthetic `com.boardsesh.app://...
// dataUrl=<key>` URL; without this redirect Expo Router treats that as an
// unmatched route and shows +not-found. Send it to the home route — the
// ShareTargetProvider then reads the shared link from the native module and
// routes on to /share-beta after auth + URL validation. Android delivers shares
// through an ACTION_SEND intent (no deep-link path), so it falls through here
// unchanged and the provider handles it the same way.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  // The browser-OAuth fallback (src/lib/auth.ts signInWithProviderWeb via
  // raceBrowserSignIn) races a Linking 'url' listener against the in-app browser:
  // the web callback page deep-links back to com.boardsesh.app://auth/callback?
  // transferToken=… and that listener owns the URL. Expo Router ALSO sees this
  // deep link and would try to navigate to a non-existent /auth/callback route,
  // flashing +not-found under the browser before the race dismisses it. Return ''
  // to skip that navigation. Verified safe against vendored expo-router@57.0.3:
  // build/link/linking.js subscribe() does `if (href) listener(href)` (warm) and
  // build/getLinkingConfig.js guards the cold-start getInitialURL the same way, so
  // a falsy path cleanly no-ops navigation. redirectSystemPath receives the FULL
  // deep-link URL as `path` (scheme + host, e.g. com.boardsesh.app://auth/callback
  // — Expo's own docs read it via `new URL(path)`), so match the callback host
  // form; the leading-slash form is a defensive belt-and-braces for a future Expo
  // that normalises to a bare path. Checked BEFORE the share-intent branch (pure
  // string ops, can't throw) so a getShareExtensionKey() throw can't bypass it.
  if (path.includes('://auth/callback') || path.startsWith('/auth/callback')) {
    return '';
  }
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      // Cold start (initial): bootstrap to the home route — the ShareTargetProvider
      // then opens /share-beta over it. Warm shares (the app already running): return
      // '' so Expo Router skips re-navigation. Returning '/' here re-fired the root
      // <Redirect href="/(tabs)/home">, re-mounting the whole Home tab tree (and its
      // feed queries) on EVERY share — the source of the sluggishness after a few
      // shares. The provider drives /share-beta off the native module either way, so
      // warm shares don't need a path redirect at all.
      return initial ? '/' : '';
    }
  } catch {
    // getShareExtensionKey() can throw off-native (web, tests, module not
    // loaded). Fall through to the no-op `return path` so ordinary deep links
    // (join/universal links) still reach their destination — never reroute them.
  }
  return path;
}
