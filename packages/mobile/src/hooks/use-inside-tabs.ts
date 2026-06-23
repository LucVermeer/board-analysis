import { useSegments } from 'expo-router';
import { isTabsChromeRoute } from '../lib/route-segments';

/**
 * True while the native tab bar and its bottom accessory should stay mounted —
 * inside the (tabs) group, OR under the player route (`/play`).
 *
 * Gates the `NativeTabs.BottomAccessory` host mount. Leaving the tabs group to a
 * pushed root screen (session detail) or another root modal (boards / share-beta)
 * fully unmounts the host: a clean React unmount releases its backing view so
 * UIKit doesn't leave a stale glass-platter snapshot stacked under the fresh one
 * on return (the doubled, offset climb name).
 *
 * The player is the exception. It's a `transparentModal` (see app/_layout.tsx), so
 * the tabs screen stays LIVE behind it — UIKit never snapshots the presenting view
 * controller (the way a `fullScreenModal` does) and never removes the accessory's
 * backing view. Unmounting the accessory under the player would instead CHURN the
 * native tab-bar height (the docked search field jumps); keeping it mounted under
 * the transparent modal is both stable AND snapshot-free, so there's nothing to
 * double. `isTabsChromeRoute` keeps it mounted there.
 *
 * `segments[0]` only, so intra-tab navigation (climbs → a climb detail in the tab
 * stack) never churns the host either.
 */
export function useInsideTabs(): boolean {
  return isTabsChromeRoute(useSegments());
}
