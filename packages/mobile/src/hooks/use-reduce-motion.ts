import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "Reduce Motion" accessibility setting so motion-heavy UI (FAB
 * icon morphs, reveal/slide animations) can fall back to instant state changes.
 * Mirrors {@link useReduceTransparency}. Defaults to `true` (conservative) until
 * the initial async read resolves, so a Reduce-Motion user never gets an
 * animated frame on cold start — animations here are interaction-triggered, so
 * the real value is always known by the time one would run.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) =>
      setReduceMotion(enabled),
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
