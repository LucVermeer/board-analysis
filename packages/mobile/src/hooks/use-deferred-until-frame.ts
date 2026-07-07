import { useEffect, useState } from 'react';

/**
 * Defer mounting heavy content until the next frame after `active` becomes true,
 * so a modal/present animation gets a cheap first frame and the heavy content
 * fills in one frame later — WITHOUT the InteractionManager starvation risk.
 *
 * Returns `false` until a single `requestAnimationFrame` fires after `active`
 * turns true, then `true`. Unlike `runAfterInteractions`, a rAF can't be starved
 * by a lingering interaction handle (a bottom-sheet present, a leaked handle), so
 * no fallback timer is needed — the frame always comes. Resets to `false` when
 * `active` goes false, so the next activation re-defers. Stays ready across
 * in-place content changes while `active` holds true (e.g. the play-drawer board
 * swiping between climbs once the drawer is open).
 */
export function useDeferredUntilFrame(active: boolean): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Screenshot mode: mount heavy content synchronously (no defer) so it
    // composites in the same frames as the open animation — Android's `adb
    // screencap` (Maestro) otherwise captures the deferred surface blank. Folds
    // out of normal builds.
    if (process.env.EXPO_PUBLIC_SCREENSHOT_MODE === '1') {
      setReady(active);
      return;
    }

    if (!active) {
      setReady(false);
      return;
    }

    // Re-defer from scratch on each (re)activation, then flip ready on the next
    // frame — the present animation runs natively over the placeholder meanwhile.
    setReady(false);
    const handle = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(handle);
  }, [active]);

  return ready;
}
