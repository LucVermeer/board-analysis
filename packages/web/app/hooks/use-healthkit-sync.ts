'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SessionSummary } from '@boardsesh/shared-schema';
import {
  isHealthKitAvailable,
  requestHealthKitAuthorization,
  saveSessionToHealthKit,
  getHealthKitAutoSync,
  setHealthKitAutoSync,
} from '@/app/lib/healthkit/healthkit-bridge';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { SET_SESSION_HEALTHKIT_WORKOUT_ID } from '@boardsesh/graphql/operations/activity-feed';
import { useWsAuthToken } from './use-ws-auth-token';

export type HealthKitSaveState = 'idle' | 'saving' | 'saved' | 'error' | 'unavailable';

type UseHealthKitSyncOptions = {
  summary: SessionSummary | null;
  boardType: string;
  /** If the session already has a HealthKit workout id persisted, start in 'saved' state. */
  existingWorkoutId?: string | null;
};

export function useHealthKitSync({ summary, boardType, existingWorkoutId }: UseHealthKitSyncOptions) {
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<HealthKitSaveState>('idle');
  const { token } = useWsAuthToken();

  useEffect(() => {
    let cancelled = false;
    void isHealthKitAvailable().then((v) => {
      if (!cancelled) setAvailable(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (existingWorkoutId) {
      setState('saved');
    } else {
      setState('idle');
    }
  }, [existingWorkoutId, summary?.sessionId]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!summary) return false;
    if (!available) {
      setState('unavailable');
      return false;
    }
    if (state === 'saving' || state === 'saved') return state === 'saved';

    setState('saving');
    const granted = await requestHealthKitAuthorization();
    if (!granted) {
      setState('error');
      return false;
    }
    const result = await saveSessionToHealthKit(summary, boardType);
    if (!result) {
      setState('error');
      return false;
    }
    try {
      const client = createGraphQLHttpClient(token);
      await client.request(SET_SESSION_HEALTHKIT_WORKOUT_ID, {
        sessionId: summary.sessionId,
        workoutId: result.workoutId,
      });
    } catch (e) {
      // Don't fail the overall flow if the back-mapping write fails — the
      // HealthKit workout exists; we just won't be able to dedupe later.
      console.warn('[HealthKit] Failed to persist workout id:', e);
    }
    setState('saved');
    return true;
  }, [summary, available, state, boardType, token]);

  return { available, state, save };
}

/**
 * Hook for reading/writing the auto-sync preference.
 */
export function useHealthKitAutoSync() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void getHealthKitAutoSync().then((v) => {
      setEnabled(v);
      setLoaded(true);
    });
  }, []);

  const update = useCallback(async (next: boolean) => {
    await setHealthKitAutoSync(next);
    setEnabled(next);
  }, []);

  return { enabled, loaded, setEnabled: update };
}
