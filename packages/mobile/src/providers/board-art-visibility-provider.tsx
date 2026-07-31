import { type ReactNode } from 'react';
import { useSegments } from 'expo-router';
import { BoardArtVisibilityContext } from '../components/board-art-visibility-context';
import { useDeviceLayout } from '../hooks/use-device-layout';
import { isPlayerRoute, tabsActiveSegment } from '../lib/route-segments';

// The top-level tab names ((tabs)/<name>). Typing the `tab` prop as this union
// (not a bare string) makes a typo in a layout's `tab="…"` a compile error rather
// than a tab that silently reports hidden forever on iPad.
export type BoardArtTab = 'climbs' | 'discover' | 'home' | 'profile' | 'record' | 'wall';

/**
 * Wraps one tab's stack so its board art blanks while that art is not on screen.
 * Two independent hidden cases, because they have different cost/benefit:
 *
 * 1. **The player is up — every device.** `/play` is a `transparentModal` that
 *    paints its OWN opaque backing (app/_layout.tsx), so the whole tab shell
 *    behind it is fully occluded while still mounted — pinning every list
 *    thumbnail's decoded bitmap for as long as the player is open. Blanking here
 *    is invisible by construction (nothing behind the player is on screen) and
 *    it is the app's peak board-art moment: the player's own full-res board is
 *    live on top, and remixing from it opens the create board as well (#3804).
 *    The player itself renders OUTSIDE every provider (it is a root route, not
 *    under `(tabs)`), so its board keeps painting — as do the root-mounted queue
 *    accessory and the iPad sidebar/detail pane.
 *
 * 2. **An inactive tab — iPad only.** The iPad shell keeps every tab mounted
 *    (`detachInactiveScreens={false}`), so without this an inactive tab's
 *    `LayeredClimbImage` views retain their decoded bitmaps off-screen for the
 *    life of the session — `Image.clearMemoryCache()` reclaims only unreferenced
 *    cache copies, not bitmaps a mounted view still holds (#3803). iPhone is
 *    opted out of THIS case only: its tabs already freeze/detach on blur, and
 *    re-decoding on every tab return would flash the thumbnails for no memory
 *    win. Case 1 is a much rarer transition for a much larger working set, so it
 *    applies on iPhone too.
 *
 * Anything hidden re-decodes from the disk cache in tens of ms when shown again.
 */
export function BoardArtVisibilityProvider({ tab, children }: { tab: BoardArtTab; children: ReactNode }) {
  const { isPad } = useDeviceLayout();
  const segments = useSegments();
  // Case 1. Deliberately keyed on the player route specifically, NOT on
  // `tabsActiveSegment(segments) === null` — that would also fire for the
  // `user-drawer` root modal and for a tab's own `create` drawer, both of which
  // float over a still-VISIBLE list. Blanking under those would be a user-facing
  // regression, so occlusion stays an explicit allowlist of opaque-backed surfaces.
  const occludedByPlayer = isPlayerRoute(segments);
  // Case 2: visible only while THIS tab is the focused top-level destination
  // (segment 1). A pushed sub-route of the tab keeps it active (`tabsActiveSegment`
  // still returns the tab name). The value is a primitive boolean, so the provider
  // needs no memo (react/jsx-no-constructed-context-values).
  const visible = !occludedByPlayer && (!isPad || tabsActiveSegment(segments) === tab);
  return <BoardArtVisibilityContext.Provider value={visible}>{children}</BoardArtVisibilityContext.Provider>;
}
