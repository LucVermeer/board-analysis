import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_GRADE_DISPLAY_FORMAT, type GradeDisplayFormat } from '@boardsesh/play-view';
import { getPreference, setPreference } from './preference-store';

export const GRADE_DISPLAY_FORMATS = ['v-grade', 'font', 'both'] as const satisfies readonly GradeDisplayFormat[];

const STORAGE_KEY = 'gradeDisplayFormat';

// Module-level store. `current`/`hasLoaded` are the canonical snapshot every
// consumer reads via `getSnapshot`/`getLoadedSnapshot`; `listeners` is the
// React-managed `Set` that `notify()` fans out across after any mutation.
let current: GradeDisplayFormat = DEFAULT_GRADE_DISPLAY_FORMAT;
let hasLoaded = false;
const listeners = new Set<() => void>();

function isGradeDisplayFormat(value: unknown): value is GradeDisplayFormat {
  return typeof value === 'string' && (GRADE_DISPLAY_FORMATS as readonly string[]).includes(value);
}

function notify(): void {
  for (const listener of listeners) listener();
}

export async function loadGradeDisplayFormat(): Promise<GradeDisplayFormat> {
  const stored = await getPreference<GradeDisplayFormat>(STORAGE_KEY);
  current = isGradeDisplayFormat(stored) ? stored : DEFAULT_GRADE_DISPLAY_FORMAT;
  hasLoaded = true;
  notify();
  return current;
}

export async function setGradeDisplayFormatPreference(format: GradeDisplayFormat): Promise<void> {
  current = format;
  hasLoaded = true;
  notify();
  await setPreference(STORAGE_KEY, format);
}

// `useSyncExternalStore` plumbing. `subscribe` registers the React-supplied
// store-change callback against the module `Set` (and kicks off the one-time
// AsyncStorage load on first mount), returning the unsubscribe. The snapshot
// getters return primitives so React's referential equality check is stable —
// no new object per render, no tearing.
function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  if (!hasLoaded) {
    void loadGradeDisplayFormat();
  }
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): GradeDisplayFormat {
  return current;
}

function getServerSnapshot(): GradeDisplayFormat {
  return DEFAULT_GRADE_DISPLAY_FORMAT;
}

function getLoadedSnapshot(): boolean {
  return hasLoaded;
}

function getLoadedServerSnapshot(): boolean {
  return false;
}

export function useGradeDisplayFormatPreference(): {
  gradeFormat: GradeDisplayFormat;
  loaded: boolean;
  setGradeFormat: (format: GradeDisplayFormat) => void;
} {
  const gradeFormat = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const loaded = useSyncExternalStore(subscribe, getLoadedSnapshot, getLoadedServerSnapshot);

  const setGradeFormat = useCallback((next: GradeDisplayFormat) => {
    void setGradeDisplayFormatPreference(next);
  }, []);

  return { gradeFormat, loaded, setGradeFormat };
}
