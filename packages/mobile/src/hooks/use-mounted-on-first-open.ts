import { useState } from 'react';

/**
 * Once-latch for lazily mounting an on-demand surface. Returns `false` until the
 * first time `visible` is true, then stays `true` forever — so a sub-sheet host
 * isn't instantiated on its parent's mount frame, but once opened it stays
 * mounted and its dismiss animation / re-opens behave normally.
 *
 * Derive-during-render (React-Compiler-safe): the setState runs during render
 * and React re-renders immediately with the latched value — no effect lag, no
 * render-time ref writes.
 */
export function useMountedOnFirstOpen(visible: boolean): boolean {
  const [hasOpened, setHasOpened] = useState(visible);
  if (visible && !hasOpened) setHasOpened(true);
  return hasOpened;
}
