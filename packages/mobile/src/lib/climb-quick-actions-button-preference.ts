import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getPreference, setPreference } from './preference-store';
import { useFeatureFlag } from '../providers/feature-flags-provider';

// Whether the climbs list shows the ⋮ quick-actions button on each row. This is a
// user setting (More → Display), but its DEFAULT is set by the
// `climb-quick-actions-button` experiment flag: the treatment cohort defaults ON
// (opted in, can turn it off), everyone else defaults OFF (opted out, can turn it
// on). So the store is TRI-STATE — `choice` is `undefined` until the climber makes
// an explicit choice, at which point their value wins over the flag default.
//
// Structure mirrors `boardsesh-grades-preference.ts`: a module-level store read via
// `useSyncExternalStore` with a referentially-stable cached snapshot (rebuilt only
// inside `notify()`), plus a promise-singleton one-time load so any number of
// mounted consumers trigger the AsyncStorage read exactly once. The flag→default
// resolution happens in the hook, not the store, since the flag is a React value.
const STORAGE_KEY = 'showClimbQuickActionsButton';

type ChoiceSnapshot = { choice: boolean | undefined; loaded: boolean };

let current: boolean | undefined;
let hasLoaded = false;
let snapshot: ChoiceSnapshot = { choice: current, loaded: hasLoaded };
const listeners = new Set<() => void>();

const SERVER_SNAPSHOT: ChoiceSnapshot = { choice: undefined, loaded: false };

function notify(): void {
  snapshot = { choice: current, loaded: hasLoaded };
  for (const listener of listeners) listener();
}

export async function loadClimbQuickActionsButtonChoice(): Promise<boolean | undefined> {
  if (hasLoaded) return current;
  const stored = await getPreference<boolean>(STORAGE_KEY);
  // A `setClimbQuickActionsButtonPreference` may have raced in while we awaited
  // storage; honour the user's choice over the (now stale) persisted value.
  if (hasLoaded) return current;
  // An explicit stored choice (true/false) wins; an absent value stays `undefined`
  // so the hook falls back to the flag-driven default.
  current = typeof stored === 'boolean' ? stored : undefined;
  hasLoaded = true;
  notify();
  return current;
}

export async function setClimbQuickActionsButtonPreference(enabled: boolean): Promise<void> {
  current = enabled;
  hasLoaded = true;
  notify();
  await setPreference(STORAGE_KEY, enabled);
}

let loadPromise: Promise<boolean | undefined> | null = null;
function ensureLoaded(): Promise<boolean | undefined> {
  if (!loadPromise) {
    loadPromise = loadClimbQuickActionsButtonChoice().catch((error: unknown) => {
      // A failed read must not leave a rejected promise cached — clear the singleton
      // so the next mount retries instead of staying stuck until the app restarts.
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): ChoiceSnapshot {
  return snapshot;
}

function getServerSnapshot(): ChoiceSnapshot {
  return SERVER_SNAPSHOT;
}

/**
 * The effective ⋮-button setting: the climber's explicit choice if they've made
 * one, otherwise the flag-driven default (treatment cohort ON, everyone else OFF).
 * Backs both the climbs-list gate and the Display settings toggle.
 */
export function useClimbQuickActionsButton(): {
  enabled: boolean;
  loaded: boolean;
  setEnabled: (enabled: boolean) => void;
} {
  const { choice, loaded } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const flagDefault = useFeatureFlag('climb-quick-actions-button') === true;

  useEffect(() => {
    // Swallow read failures here — the load already clears its cached promise so a
    // later mount retries; nothing to do at this call site.
    ensureLoaded().catch(() => {});
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    void setClimbQuickActionsButtonPreference(next);
  }, []);

  return { enabled: choice ?? flagDefault, loaded, setEnabled };
}
