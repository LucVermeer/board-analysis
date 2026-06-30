// Persists the Logbook tab's filter + sort settings across app restarts. Backed
// by AsyncStorage (a UI preference, not a secret — see preference-store). The
// climb-name search term is intentionally NOT persisted; it's transient.
//
// Web's analogue persists the same filter/sort shape via IndexedDB
// (user-preferences-db `logbookPreferences`); both go through @boardsesh/logbook
// for the schema + sanitizers so a payload from either platform round-trips.

import {
  sanitizeLogbookFilters,
  sanitizeLogbookSort,
  type LogbookFilterState,
  type LogbookSortState,
} from '@boardsesh/logbook';
import { getPreference, setPreference } from './preference-store';

const STORAGE_KEY = 'logbookSearchPrefs';
// Persisted-schema version. v2 = the sends-only status default; a legacy payload
// (v1 / unstamped) still on the old "both" default is migrated once on load.
const LOGBOOK_PREFS_VERSION = 2;

export type StoredLogbookPrefs = { filters: LogbookFilterState; sort: LogbookSortState };

/** Load persisted logbook filter/sort prefs (sanitized); null when never set. */
export async function loadLogbookPrefs(): Promise<StoredLogbookPrefs | null> {
  try {
    const stored = await getPreference<{ version?: number; filters?: unknown; sort?: unknown }>(STORAGE_KEY);
    if (!stored) return null;
    // Sanitize every field so a stale/partial payload (older app version, manual
    // edit) can never feed an invalid filter/sort into the query.
    const filters = sanitizeLogbookFilters(stored.filters);
    const sort = sanitizeLogbookSort(stored.sort);
    // One-time migration to the sends-only default (mirrors web's
    // sanitizeLogbookPreferences v1→v2): a legacy payload still on the old "both"
    // default drops attempts. saveLogbookPrefs stamps the version, so this runs
    // once and "both" stays selectable afterward.
    if (stored.version !== LOGBOOK_PREFS_VERSION && filters.includeSends && filters.includeAttempts) {
      filters.includeAttempts = false;
    }
    return { filters, sort };
  } catch {
    // Storage unavailable/errored — treat as "no prefs" so the caller's
    // hydration still completes and the logbook never gets stuck loading.
    return null;
  }
}

/** Persist the logbook filter/sort prefs so they survive an app restart. */
export async function saveLogbookPrefs(prefs: StoredLogbookPrefs): Promise<void> {
  try {
    await setPreference(STORAGE_KEY, { version: LOGBOOK_PREFS_VERSION, ...prefs });
  } catch {
    // Storage write failed (full disk, first-install permission race). Persisting
    // a UI preference is best-effort, so swallow rather than leak an unhandled
    // rejection from the fire-and-forget caller (mirrors loadLogbookPrefs).
  }
}
