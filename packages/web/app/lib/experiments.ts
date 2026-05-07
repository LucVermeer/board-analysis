'use client';

import { useEffect, useState } from 'react';
import { getPreference, setPreference } from './user-preferences-db';

/**
 * User-toggleable experiments. Persisted to IndexedDB through
 * `user-preferences-db` under the `experiment:*` key namespace, exposed
 * via `useExperiment` for components and toggled from the experiments
 * drawer.
 *
 * Adding a new experiment:
 *   1. Add the key to `ExperimentKey` below.
 *   2. Add the matching `experiment:<key>: boolean` entry to
 *      `UserPreferenceKeyMap` in user-preferences-db.ts.
 *   3. Append a definition to `EXPERIMENTS` with i18n label/description
 *      keys (under the `common` namespace).
 */

export type ExperimentKey = 'queueBarFab';

export type ExperimentDefinition = {
  key: ExperimentKey;
  /** i18n key under the `common` namespace. */
  labelKey: string;
  /** i18n key under the `common` namespace. */
  descriptionKey: string;
  default: boolean;
};

export const EXPERIMENTS: readonly ExperimentDefinition[] = [
  {
    key: 'queueBarFab',
    labelKey: 'experiments.queueBarFab.label',
    descriptionKey: 'experiments.queueBarFab.description',
    default: false,
  },
] as const;

const EXPERIMENT_CHANGE_EVENT = 'boardsesh:experiment-changed';

type ExperimentPreferenceKey = `experiment:${ExperimentKey}`;

const preferenceKey = (key: ExperimentKey): ExperimentPreferenceKey => `experiment:${key}`;

const getDefault = (key: ExperimentKey): boolean =>
  EXPERIMENTS.find((definition) => definition.key === key)?.default ?? false;

type ExperimentChangeDetail = { key: ExperimentKey; value: boolean };

const dispatchChange = (detail: ExperimentChangeDetail) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ExperimentChangeDetail>(EXPERIMENT_CHANGE_EVENT, { detail }));
};

/**
 * React hook returning the current value of an experiment.
 *
 * Initial render returns the registered default (so SSR and the first
 * client paint stay in sync). The persisted IndexedDB value lands on the
 * effect tick. Toggles dispatched through `setExperiment` notify every
 * mounted consumer in the same tab via a window CustomEvent.
 */
export function useExperiment(key: ExperimentKey): boolean {
  const [value, setValue] = useState<boolean>(() => getDefault(key));

  useEffect(() => {
    let cancelled = false;
    void getPreference<boolean>(preferenceKey(key)).then((stored) => {
      if (cancelled) return;
      if (typeof stored === 'boolean') setValue(stored);
    });

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ExperimentChangeDetail>).detail;
      if (detail?.key === key) setValue(detail.value);
    };
    window.addEventListener(EXPERIMENT_CHANGE_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(EXPERIMENT_CHANGE_EVENT, onChange);
    };
  }, [key]);

  return value;
}

/**
 * Persist a new value for an experiment and broadcast it so every
 * `useExperiment` consumer in the same tab re-renders.
 */
export async function setExperiment(key: ExperimentKey, value: boolean): Promise<void> {
  await setPreference(preferenceKey(key), value);
  dispatchChange({ key, value });
}
