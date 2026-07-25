import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { Image } from 'expo-image';
import { useSegments } from 'expo-router';
import { useIsAppBackgrounded } from '../lib/app-visibility';
import { useDeviceLayout } from './use-device-layout';
import { tabsActiveSegment } from '../lib/route-segments';

// Sweep expo-image's in-memory decoded-bitmap cache on background and on OS
// memory-pressure warnings. The foreground `memoryWarning` path is the direct
// lever against the iOS OOM watchdog kill on low-RAM devices (#3479); the disk
// cache is untouched, so foregrounding re-decodes from disk in tens of ms (no
// network). LayeredClimbImage blanks its <Image> layers on background first,
// returning their bitmaps to the pool this sweep then frees.
export function useImageCacheMemoryManagement(): void {
  const isBackgrounded = useIsAppBackgrounded();

  useEffect(() => {
    if (isBackgrounded) void Image.clearMemoryCache();
  }, [isBackgrounded]);

  useEffect(() => {
    const sub = AppState.addEventListener('memoryWarning', () => {
      void Image.clearMemoryCache();
    });
    // React Native Web does not implement the native memoryWarning event and
    // returns no subscription. The background sweep above still works there.
    return () => sub?.remove();
  }, []);
}

// Sweep expo-image's in-memory decoded-bitmap cache on every iPad top-level tab
// switch. The iPad shell keeps every tab mounted (`detachInactiveScreens={false}`,
// for the #3153 re-attach cost), so a long foreground session accumulates decoded
// board art from every tab that the background / memoryWarning sweeps never reach:
// an iPad kept open for days never backgrounds, and the OS memory warning can
// arrive only after an allocation has already failed — the #3803 crash pattern
// (SIGSEGV mid image-decode, ~3.7 days uptime). Clearing on tab change bounds that
// growth at a natural seam; the disk cache is untouched, so the incoming tab
// re-decodes in tens of ms. iPhone opts out (its tabs freeze/detach on blur, and a
// clear on every switch would needlessly re-decode the destination's art).
export function useIpadTabSwitchImageCacheSweep(): void {
  const { isPad } = useDeviceLayout();
  const segments = useSegments();
  const activeTab = tabsActiveSegment(segments);
  const lastTab = useRef<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    // Seed the first observation so mounting never sweeps — only a genuine
    // tab-to-tab change should clear the cache. A pushed sub-route inside a tab
    // keeps `activeTab` the same (tabsActiveSegment reads segment 1), so
    // navigating within a tab doesn't sweep.
    if (!seeded.current) {
      seeded.current = true;
      lastTab.current = activeTab;
      return;
    }
    if (activeTab === lastTab.current) return;
    lastTab.current = activeTab;
    if (isPad) void Image.clearMemoryCache();
  }, [activeTab, isPad]);
}
