// Ephemeral cross-tree signal: is the Climbs-tab search FAB currently expanded?
//
// The global climb toolbar (capsule + tick, mounted at the app root) and the
// search FAB (mounted inside the Climbs screen) live in separate subtrees but
// share one visual row. When search expands it grows rightward across that row,
// so the global capsule + tick must fade out of the way. Rather than thread a
// provider between two unrelated mount points, we broadcast the boolean through
// a module-level listener set — the same pattern as `search-layout-preference`,
// minus persistence (this is transient UI state, never written to storage).

import { useEffect, useState } from 'react';

let expanded = false;
const listeners = new Set<(value: boolean) => void>();

/** Set by the search FAB on expand/collapse (and reset on unmount). */
export function setSearchExpanded(value: boolean): void {
  if (expanded === value) return;
  expanded = value;
  for (const listener of listeners) listener(expanded);
}

/** Subscribe to whether the Climbs-tab search is expanded. */
export function useSearchExpanded(): boolean {
  const [value, setValue] = useState(expanded);
  useEffect(() => {
    // Re-sync on mount in case it changed between render and effect.
    setValue(expanded);
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
