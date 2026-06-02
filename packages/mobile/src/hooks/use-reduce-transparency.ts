import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "Reduce Transparency" accessibility setting.
 *
 * `isLiquidGlassAvailable()` can report `true` even when the user has asked the
 * system to limit translucency, so glass/blur surfaces consult this hook and
 * fall back to a solid background when it returns `true`. Defaults to `false`
 * until the initial async read resolves.
 */
export function useReduceTransparency(): boolean {
  // Default to `true` (conservative) until the async OS read resolves, so a
  // user with Reduce Transparency enabled never sees a frame of glass/blur on
  // cold start. Non-RT users get one frame of solid before glass fades in,
  // which is far less jarring than the reverse.
  const [reduceTransparency, setReduceTransparency] = useState(true);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (mounted) setReduceTransparency(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (enabled) =>
      setReduceTransparency(enabled),
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceTransparency;
}
