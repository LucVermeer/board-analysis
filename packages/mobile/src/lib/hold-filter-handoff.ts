import type { HoldsFilter } from '@boardsesh/shared-schema';

// Hands the edited hold filter back from the full-screen board sub-screen to the
// ClimbFilterSheet, mirroring `filter-handoff` (setters). The sub-screen owns the
// interactive board; the sheet stays mounted underneath and picks up the result
// when the screen pops, so the user keeps editing the rest of the filters.
type HoldsFilterListener = (holdsFilter: HoldsFilter) => void;

const holdsFilterListeners = new Set<HoldsFilterListener>();

export function emitHoldsFilterSelection(holdsFilter: HoldsFilter): void {
  for (const listener of holdsFilterListeners) {
    listener(holdsFilter);
  }
}

export function subscribeToHoldsFilterSelection(listener: HoldsFilterListener): () => void {
  holdsFilterListeners.add(listener);
  return () => {
    holdsFilterListeners.delete(listener);
  };
}
