import type { HoldsFilter } from '@boardsesh/shared-schema';

// Hands the edited hold filter back from the full-screen board sub-screen to the
// climb-list filter coordinator. The coordinator keeps the in-progress filter
// draft while the sheet is hidden, then reopens the sheet after the route pops.
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
