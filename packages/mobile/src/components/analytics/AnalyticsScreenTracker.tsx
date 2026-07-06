import { useEffect, useRef } from 'react';
import { useSegments } from 'expo-router';
import { trackScreen } from '../../lib/analytics';
import { normalizeScreenPath } from '../../lib/analytics-screen-path';

// Fires a $screen event on every Expo Router navigation, using the route pattern
// (e.g. /climbs/[climbUuid]) rather than the concrete path so PostHog sees one
// screen per route, not one per climb. The lastPath ref dedupes the repeated
// segment emissions Expo Router produces during a transition. Renders nothing.
export function AnalyticsScreenTracker(): null {
  const segments = useSegments();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const path = normalizeScreenPath(segments);
    if (path === lastPath.current) return;
    lastPath.current = path;
    trackScreen(path);
    // Screenshot mode: tell the capture orchestrator we reached home directly (not
    // via Metro's `$screen /home` log, which intermittently stops forwarding mid-run
    // with ERR_STREAM_UNABLE_TO_PIPE). Fire-and-forget GET to its readiness server;
    // the inlined guard dead-strips this in normal builds.
    if (process.env.EXPO_PUBLIC_SCREENSHOT_MODE === '1' && path === '/home') {
      const readyUrl = process.env.EXPO_PUBLIC_SCREENSHOT_READY_URL;
      if (readyUrl) {
        void fetch(readyUrl).catch(() => {});
      }
    }
  }, [segments]);

  return null;
}
