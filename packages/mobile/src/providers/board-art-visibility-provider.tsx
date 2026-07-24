import { type ReactNode } from 'react';
import { useSegments } from 'expo-router';
import { BoardArtVisibilityContext } from '../components/board-art-visibility-context';
import { useDeviceLayout } from '../hooks/use-device-layout';
import { tabsActiveSegment } from '../lib/route-segments';

/**
 * Wraps one iPad tab's stack so its board art blanks while another tab is the
 * focused destination. The iPad shell keeps every tab mounted
 * (`detachInactiveScreens={false}`), so without this an inactive tab's
 * `LayeredClimbImage` views retain their decoded bitmaps off-screen for the life
 * of the session — `Image.clearMemoryCache()` reclaims only unreferenced cache
 * copies, not bitmaps a mounted view still holds (#3803).
 *
 * iPhone is opted out by construction (`isPad` is launch-fixed false → always
 * visible): its tabs already freeze/detach on blur, and re-decoding board art on
 * every tab return would flash the thumbnails for no memory win.
 */
export function BoardArtVisibilityProvider({ tab, children }: { tab: string; children: ReactNode }) {
  const { isPad } = useDeviceLayout();
  const segments = useSegments();
  // Non-iPad: always visible. On iPad: visible only while THIS tab is the focused
  // top-level destination (segment 1). A pushed sub-route of the tab keeps it active
  // (`tabsActiveSegment` still returns the tab name); a root modal or the player
  // (segment 0 is not `(tabs)`) returns null, so every tab blanks — correct, the
  // shell behind it is occluded. The value is a primitive boolean, so the provider
  // needs no memo (react/jsx-no-constructed-context-values).
  const visible = !isPad || tabsActiveSegment(segments) === tab;
  return <BoardArtVisibilityContext.Provider value={visible}>{children}</BoardArtVisibilityContext.Provider>;
}
