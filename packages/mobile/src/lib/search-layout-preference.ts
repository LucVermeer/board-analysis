// User-selectable layout for the climbs search screen. We ship two real
// layouts and let the climber pick — this is the rollout mechanism for the
// TestFlight cohort to try both and tell us which they prefer, instead of a
// hidden flag.
//
//  - `bottom-bar`   — grade pill + filter pills + result count pinned in the
//                     thumb zone above the queue bar.
//  - `sticky-strip` — grade + filters in a sticky strip under the nav header.
//
// Backed by the non-secret AsyncStorage preference store. A module-level
// listener set keeps the climbs screen and the More-tab setting in sync
// without threading a provider through the tree.

import { useCallback, useEffect, useState } from 'react';
import { getPreference, setPreference } from './preference-store';

export const SEARCH_LAYOUTS = ['bottom-bar', 'sticky-strip'] as const;
export type SearchLayout = (typeof SEARCH_LAYOUTS)[number];

export const DEFAULT_SEARCH_LAYOUT: SearchLayout = 'bottom-bar';

const STORAGE_KEY = 'search-layout';

let current: SearchLayout = DEFAULT_SEARCH_LAYOUT;
let hasLoaded = false;
const listeners = new Set<(layout: SearchLayout) => void>();

function isSearchLayout(value: unknown): value is SearchLayout {
  return typeof value === 'string' && (SEARCH_LAYOUTS as readonly string[]).includes(value);
}

function notify(): void {
  for (const listener of listeners) listener(current);
}

/**
 * Read the persisted layout into the module cache and notify subscribers.
 * Falls back to the default for a missing/invalid value. Safe to call
 * repeatedly — later callers just re-broadcast the cached value.
 */
export async function loadSearchLayout(): Promise<SearchLayout> {
  const stored = await getPreference<SearchLayout>(STORAGE_KEY);
  current = isSearchLayout(stored) ? stored : DEFAULT_SEARCH_LAYOUT;
  hasLoaded = true;
  notify();
  return current;
}

/** Persist the chosen layout and broadcast it to every mounted consumer. */
export async function setSearchLayoutPreference(layout: SearchLayout): Promise<void> {
  current = layout;
  hasLoaded = true;
  notify();
  await setPreference(STORAGE_KEY, layout);
}

/**
 * Subscribe to the current search layout. Triggers a one-time load on first
 * mount; updates live when the setting changes anywhere in the app.
 */
export function useSearchLayout(): {
  layout: SearchLayout;
  loaded: boolean;
  setLayout: (layout: SearchLayout) => void;
} {
  const [layout, setLayoutState] = useState<SearchLayout>(current);
  const [loaded, setLoaded] = useState<boolean>(hasLoaded);

  useEffect(() => {
    const listener = (next: SearchLayout) => {
      setLayoutState(next);
      setLoaded(true);
    };
    listeners.add(listener);
    if (!hasLoaded) {
      void loadSearchLayout();
    } else {
      // Sync this fresh subscriber to the cached value (it may have changed
      // between module init and mount).
      setLayoutState(current);
      setLoaded(true);
    }
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setLayout = useCallback((next: SearchLayout) => {
    void setSearchLayoutPreference(next);
  }, []);

  return { layout, loaded, setLayout };
}
