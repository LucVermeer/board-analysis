import { Redirect } from 'expo-router';

/**
 * App launcher route. Always lands on the Climbs tab — our search surface and
 * home base. When no board is active yet, the Climbs screen shows a "choose your
 * board" CTA (board switching is rare, so it lives in a modal, not a tab).
 * Explicit tab routes (join -> Record, deep links) keep their own target.
 */
export default function MobileHome() {
  return <Redirect href="/(tabs)/climbs" />;
}
