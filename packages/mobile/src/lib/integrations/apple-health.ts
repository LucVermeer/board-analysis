// Apple Health auto-save orchestration. Mobile-local port of the web file at
// `packages/web/app/lib/healthkit/healthkit-auto-save.ts`. The web copy is
// Capacitor-legacy (it drives the old `@perfood/capacitor-healthkit`-style
// bridge); this one drives the Expo `health-workouts` native module instead.
// The dedup-guard semantics (claim synchronously, release on skip/failure so a
// retry can proceed) are kept identical so both platforms behave the same.
//
// A duplicate mobile copy is intentional: web and mobile use different native
// bridges and different storage/analytics seams, and the save-state store here
// additionally powers per-session UI (saving / saved / failed) that web doesn't
// surface.

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { SessionSummary } from '@boardsesh/shared-schema';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import { SET_SESSION_HEALTHKIT_WORKOUT_ID } from '@boardsesh/graphql/operations/activity-feed';
// Imported by relative path (not the package name) to match the live-activity
// module convention in this repo: Expo autolinking discovers the *native* side
// via modules/health-workouts/expo-module.config.json, while the JS wrapper is
// pulled in directly from its source so Metro + vitest resolve it without the
// package needing a dependency entry.
import { healthWorkoutsNative } from '../../../modules/health-workouts/src/index';
import { track } from '../analytics';
import { getHttpClient } from '../graphql/client';
import { getPreference, setPreference } from '../preference-store';
import type { SessionExportContext } from './types';

const AUTO_SAVE_KEY = 'appleHealthAutoSave';
const AUTH_REQUESTED_KEY = 'appleHealthAuthRequested';

// ============================================
// Availability + authorization
// ============================================

export async function isAppleHealthAvailable(): Promise<boolean> {
  if (!healthWorkoutsNative) return false;
  const { available } = await healthWorkoutsNative.isAvailable();
  return available;
}

export async function requestAppleHealthAuthorization(): Promise<boolean> {
  if (!healthWorkoutsNative) return false;
  // Record that we've shown the system sheet at least once. The UI uses this to
  // decide whether the first auto-save will prompt vs. silently use a prior
  // grant/denial (HealthKit never re-shows the sheet for an already-decided
  // type).
  await setPreference(AUTH_REQUESTED_KEY, true);
  const { granted } = await healthWorkoutsNative.requestAuthorization();
  return granted;
}

export async function getAppleHealthAuthRequested(): Promise<boolean> {
  return (await getPreference<boolean>(AUTH_REQUESTED_KEY)) === true;
}

// ============================================
// Auto-save preference (default ON)
// ============================================

type AutoSaveSnapshot = { enabled: boolean; loaded: boolean };

// Default ON: only an explicit `false` in storage disables it. Mirrors
// session-recording-preference.ts (useSyncExternalStore over a module-level
// store + a promise-singleton one-time load) — but the default polarity is
// flipped (recording defaults OFF, Apple Health auto-save defaults ON).
let autoSaveEnabled = true;
let autoSaveLoaded = false;
let autoSaveSnapshot: AutoSaveSnapshot = { enabled: autoSaveEnabled, loaded: autoSaveLoaded };
const autoSaveListeners = new Set<() => void>();

const AUTO_SAVE_SERVER_SNAPSHOT: AutoSaveSnapshot = { enabled: true, loaded: false };

function notifyAutoSave(): void {
  autoSaveSnapshot = { enabled: autoSaveEnabled, loaded: autoSaveLoaded };
  for (const listener of autoSaveListeners) listener();
}

async function loadAutoSaveEnabled(): Promise<boolean> {
  if (autoSaveLoaded) return autoSaveEnabled;
  const stored = await getPreference<boolean>(AUTO_SAVE_KEY);
  // A setter may have raced in while we awaited storage; honour the user's live
  // choice over the (now stale) persisted value.
  if (autoSaveLoaded) return autoSaveEnabled;
  // Default ON: anything other than an explicit `false` keeps it enabled.
  autoSaveEnabled = stored !== false;
  autoSaveLoaded = true;
  notifyAutoSave();
  return autoSaveEnabled;
}

async function setAutoSaveEnabledPreference(enabled: boolean): Promise<void> {
  autoSaveEnabled = enabled;
  autoSaveLoaded = true;
  notifyAutoSave();
  await setPreference(AUTO_SAVE_KEY, enabled);
}

/** Read the persisted auto-save preference. Used by the non-React auto-save
 *  path, which can't subscribe to the store. Returns true by default. */
async function getAutoSaveEnabled(): Promise<boolean> {
  return loadAutoSaveEnabled();
}

let autoSaveLoadPromise: Promise<boolean> | null = null;
function ensureAutoSaveLoaded(): Promise<boolean> {
  if (!autoSaveLoadPromise) {
    autoSaveLoadPromise = loadAutoSaveEnabled().catch((error: unknown) => {
      // A failed read must not leave a rejected promise cached — clear the
      // singleton so the next mount retries instead of staying stuck.
      autoSaveLoadPromise = null;
      throw error;
    });
  }
  return autoSaveLoadPromise;
}

function subscribeAutoSave(onStoreChange: () => void): () => void {
  autoSaveListeners.add(onStoreChange);
  return () => {
    autoSaveListeners.delete(onStoreChange);
  };
}

function getAutoSaveSnapshot(): AutoSaveSnapshot {
  return autoSaveSnapshot;
}

function getAutoSaveServerSnapshot(): AutoSaveSnapshot {
  return AUTO_SAVE_SERVER_SNAPSHOT;
}

export function useHealthKitAutoSavePreference(): {
  enabled: boolean;
  loaded: boolean;
  setEnabled: (value: boolean) => void;
} {
  const { enabled, loaded } = useSyncExternalStore(subscribeAutoSave, getAutoSaveSnapshot, getAutoSaveServerSnapshot);

  useEffect(() => {
    // Swallow read failures here — the load clears its cached promise so a later
    // mount retries; nothing to do at this call site.
    ensureAutoSaveLoaded().catch(() => {});
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    void setAutoSaveEnabledPreference(next);
  }, []);

  return { enabled, loaded, setEnabled };
}

// ============================================
// Per-session save state (saving / saved / failed)
// ============================================

export type HealthKitSaveState = 'saving' | 'saved' | 'failed';

// Module-level Map doubles as the dedup guard (the web file's
// `savedOrInFlight` Set) AND the source for the per-session save-state UI. A
// sessionId present with 'saving' or 'saved' means a save is claimed; 'failed'
// is releasable so a manual retry can overwrite it.
const saveStateBySession = new Map<string, HealthKitSaveState>();
const saveStateListeners = new Set<() => void>();

function notifySaveState(): void {
  for (const listener of saveStateListeners) listener();
}

function setSaveState(sessionId: string, state: HealthKitSaveState): void {
  saveStateBySession.set(sessionId, state);
  notifySaveState();
}

function clearSaveState(sessionId: string): void {
  if (saveStateBySession.delete(sessionId)) notifySaveState();
}

function subscribeSaveState(onStoreChange: () => void): () => void {
  saveStateListeners.add(onStoreChange);
  return () => {
    saveStateListeners.delete(onStoreChange);
  };
}

export function useHealthKitSaveState(sessionId: string): HealthKitSaveState | null {
  const getSnapshot = useCallback((): HealthKitSaveState | null => {
    return saveStateBySession.get(sessionId) ?? null;
  }, [sessionId]);
  return useSyncExternalStore(subscribeSaveState, getSnapshot, getSnapshot);
}

/** Reset the per-session save-state store. For tests only. */
export function _resetHealthKitSaveStateForTests(): void {
  saveStateBySession.clear();
  notifySaveState();
  // Also reset the auto-save preference load cache so a test that set the
  // preference off doesn't leak its (cached) value into the next test.
  autoSaveEnabled = true;
  autoSaveLoaded = false;
  autoSaveLoadPromise = null;
  notifyAutoSave();
}

// ============================================
// Save orchestration
// ============================================

/** Best-effort: persist the HealthKit workout id to the backend for
 *  deduplication. Works for party sessions too. A failure here is non-fatal —
 *  the HealthKit workout already exists. */
async function persistWorkoutId(sessionId: string, workoutId: string): Promise<void> {
  try {
    await getHttpClient().request(SET_SESSION_HEALTHKIT_WORKOUT_ID, { sessionId, workoutId });
  } catch (error) {
    console.warn('[AppleHealth] Failed to persist workout id:', error);
  }
}

/** Map a SessionSummary + context to the native saveWorkout options, or null
 *  when the session lacks the start/end timestamps the workout requires. */
function buildSaveOptions(summary: SessionSummary, ctx: SessionExportContext) {
  if (!summary.startedAt || !summary.endedAt) return null;
  return {
    sessionId: summary.sessionId,
    startDate: summary.startedAt,
    endDate: summary.endedAt,
    totalSends: summary.totalSends,
    totalAttempts: summary.totalAttempts,
    hardestGrade: summary.hardestClimb?.grade,
    boardType: ctx.boardType,
    lapTimestamps: ctx.lapTimestamps,
  };
}

/**
 * Auto-save a finished session to Apple Health. Semantics ported from the web
 * `autoSaveToHealthKit`:
 *
 * - Claims the dedup guard synchronously at entry (sets 'saving'); a session
 *   already 'saving' or 'saved' returns null without a second native call.
 * - Auto-save preference off / unavailable / authorization denied / missing
 *   timestamps all RELEASE the guard (delete the entry) and return null, so the
 *   manual save button still works.
 * - On success: marks 'saved', best-effort persists the workout id, tracks the
 *   export, returns the workout id.
 * - On a thrown native error: marks 'failed' and returns null (a manual retry
 *   can overwrite the 'failed' entry).
 *
 * Returns the workoutId when HealthKit accepted the write, else null.
 */
export async function autoSaveToAppleHealth(
  summary: SessionSummary,
  ctx: SessionExportContext,
): Promise<string | null> {
  const { sessionId } = summary;

  // Claim synchronously — prevents a concurrent auto + manual save from both
  // reaching the native bridge.
  const existing = saveStateBySession.get(sessionId);
  if (existing === 'saving' || existing === 'saved') return null;
  setSaveState(sessionId, 'saving');

  try {
    const enabled = await getAutoSaveEnabled();
    if (!enabled) {
      clearSaveState(sessionId);
      return null;
    }

    const available = await isAppleHealthAvailable();
    if (!available) {
      clearSaveState(sessionId);
      return null;
    }

    const granted = await requestAppleHealthAuthorization();
    if (!granted) {
      clearSaveState(sessionId);
      return null;
    }

    const options = buildSaveOptions(summary, ctx);
    if (!options || !healthWorkoutsNative) {
      clearSaveState(sessionId);
      return null;
    }

    const { workoutId } = await healthWorkoutsNative.saveWorkout(options);
    setSaveState(sessionId, 'saved');
    await persistWorkoutId(sessionId, workoutId);
    track(SHARED_EVENTS.SessionExportedToIntegration, { integration: 'apple_health', trigger: 'auto' });
    return workoutId;
  } catch (error) {
    setSaveState(sessionId, 'failed');
    console.warn('[AppleHealth] Auto-save failed:', error);
    return null;
  }
}

/**
 * Manually save a finished session to Apple Health (tapped from the summary
 * screen). Like the auto path but skips the preference check and reports a
 * coarse outcome the UI can render.
 *
 * - Already 'saved', or a save is in flight ('saving') → returns 'saved'
 *   without starting a second native write. This is what keeps a concurrent
 *   auto + manual save (they share this store) down to ONE native call: whoever
 *   claims 'saving' first wins, the other observes it and bails.
 * - A previous 'failed' (retryable) or no prior entry → claims 'saving' and
 *   proceeds, so a manual retry after a failed save works.
 * - unavailable / denied delete the entry and return that outcome.
 * - success marks 'saved', persists the workout id, tracks (trigger 'manual').
 * - a thrown native error marks 'failed' and returns 'failed'.
 */
export async function manualSaveToAppleHealth(
  summary: SessionSummary,
  ctx: SessionExportContext,
): Promise<'saved' | 'denied' | 'unavailable' | 'failed'> {
  const { sessionId } = summary;

  const existing = saveStateBySession.get(sessionId);
  if (existing === 'saved' || existing === 'saving') return 'saved';
  // 'failed' (retryable) or no entry proceed by claiming.
  setSaveState(sessionId, 'saving');

  try {
    const available = await isAppleHealthAvailable();
    if (!available) {
      clearSaveState(sessionId);
      return 'unavailable';
    }

    const granted = await requestAppleHealthAuthorization();
    if (!granted) {
      clearSaveState(sessionId);
      return 'denied';
    }

    const options = buildSaveOptions(summary, ctx);
    if (!options || !healthWorkoutsNative) {
      setSaveState(sessionId, 'failed');
      return 'failed';
    }

    const { workoutId } = await healthWorkoutsNative.saveWorkout(options);
    setSaveState(sessionId, 'saved');
    await persistWorkoutId(sessionId, workoutId);
    track(SHARED_EVENTS.SessionExportedToIntegration, { integration: 'apple_health', trigger: 'manual' });
    return 'saved';
  } catch (error) {
    setSaveState(sessionId, 'failed');
    console.warn('[AppleHealth] Manual save failed:', error);
    return 'failed';
  }
}
