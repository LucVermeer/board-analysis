import type { SessionSummary } from '@boardsesh/shared-schema';
import {
  isHealthKitAvailable,
  requestHealthKitAuthorization,
  saveSessionToHealthKit,
  getHealthKitAutoSync,
} from './healthkit-bridge';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { SET_SESSION_HEALTHKIT_WORKOUT_ID } from '@boardsesh/graphql/operations/activity-feed';

// Guards against duplicate saves when both end-session paths fire for the
// same session. Stores sessionIds that are currently being saved or have
// already been saved.
const savedOrInFlight = new Set<string>();

/** Check if a session has already been saved or is currently being saved. */
export function isSessionSavedOrInFlight(sessionId: string): boolean {
  return savedOrInFlight.has(sessionId);
}

/** Mark a session as saved (used by manual save path to share the guard). */
export function markSessionSaved(sessionId: string): void {
  savedOrInFlight.add(sessionId);
}

/** Reset the dedup guard (for testing). */
export function _resetAutoSaveGuard() {
  savedOrInFlight.clear();
}

/**
 * Standalone async function that auto-saves a session to HealthKit.
 * No React dependencies — can be called from any context.
 *
 * Returns the workoutId if the HealthKit write succeeded (even if the
 * backend persist of the workoutId fails), or null if skipped/failed
 * before reaching HealthKit.
 *
 * Uses a module-level guard to prevent duplicate saves when multiple
 * end-session code paths fire for the same session.
 */
export async function autoSaveToHealthKit(
  summary: SessionSummary,
  boardType: string,
  authToken: string | null,
): Promise<string | null> {
  // Claim the guard synchronously at entry — prevents concurrent duplicate
  // saves even when multiple end-session code paths fire simultaneously.
  if (savedOrInFlight.has(summary.sessionId)) return null;
  savedOrInFlight.add(summary.sessionId);

  try {
    const autoSyncEnabled = await getHealthKitAutoSync();
    if (!autoSyncEnabled) {
      // Release guard so the manual save button still works
      savedOrInFlight.delete(summary.sessionId);
      return null;
    }

    const available = await isHealthKitAvailable();
    if (!available) {
      savedOrInFlight.delete(summary.sessionId);
      return null;
    }

    const granted = await requestHealthKitAuthorization();
    if (!granted) {
      savedOrInFlight.delete(summary.sessionId);
      return null;
    }

    const result = await saveSessionToHealthKit(summary, boardType);
    if (!result) {
      savedOrInFlight.delete(summary.sessionId);
      return null;
    }

    // Persist the workoutId to the backend for deduplication.
    // If this fails the HealthKit workout still exists — return the
    // workoutId so the caller knows the save succeeded and won't retry.
    if (authToken) {
      try {
        const client = createGraphQLHttpClient(authToken);
        await client.request(SET_SESSION_HEALTHKIT_WORKOUT_ID, {
          sessionId: summary.sessionId,
          workoutId: result.workoutId,
        });
      } catch (e) {
        console.warn('[HealthKit] Failed to persist workout id:', e);
      }
    }

    return result.workoutId;
  } catch (e) {
    // Remove from guard so a retry is possible after a genuine failure
    savedOrInFlight.delete(summary.sessionId);
    console.warn('[HealthKit] Auto-save failed:', e);
    return null;
  }
}
