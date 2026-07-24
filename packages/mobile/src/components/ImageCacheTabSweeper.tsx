import { useIpadTabSwitchImageCacheSweep } from '../hooks/use-image-cache-memory-management';

// Runs the iPad tab-switch image-cache sweep (see useIpadTabSwitchImageCacheSweep).
// Kept as a mounted-once leaf beside AnalyticsScreenTracker so its useSegments
// re-render on every navigation stays a null render and never touches the root
// layout tree.
export function ImageCacheTabSweeper(): null {
  useIpadTabSwitchImageCacheSweep();
  return null;
}
