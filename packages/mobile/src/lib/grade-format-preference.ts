import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_GRADE_DISPLAY_FORMAT, type GradeDisplayFormat } from '@boardsesh/play-view';
import { getPreference, setPreference } from './preference-store';

export const GRADE_DISPLAY_FORMATS = ['v-grade', 'font', 'both'] as const satisfies readonly GradeDisplayFormat[];

const STORAGE_KEY = 'gradeDisplayFormat';

let current: GradeDisplayFormat = DEFAULT_GRADE_DISPLAY_FORMAT;
let hasLoaded = false;
const listeners = new Set<(format: GradeDisplayFormat) => void>();

function isGradeDisplayFormat(value: unknown): value is GradeDisplayFormat {
  return typeof value === 'string' && (GRADE_DISPLAY_FORMATS as readonly string[]).includes(value);
}

function notify(): void {
  for (const listener of listeners) listener(current);
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

export function useGradeDisplayFormatPreference(): {
  gradeFormat: GradeDisplayFormat;
  loaded: boolean;
  setGradeFormat: (format: GradeDisplayFormat) => void;
} {
  const [gradeFormat, setGradeFormatState] = useState<GradeDisplayFormat>(current);
  const [loaded, setLoaded] = useState<boolean>(hasLoaded);

  useEffect(() => {
    const listener = (next: GradeDisplayFormat) => {
      setGradeFormatState(next);
      setLoaded(true);
    };
    listeners.add(listener);
    if (!hasLoaded) {
      void loadGradeDisplayFormat();
    } else {
      setGradeFormatState(current);
      setLoaded(true);
    }
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setGradeFormat = useCallback((next: GradeDisplayFormat) => {
    void setGradeDisplayFormatPreference(next);
  }, []);

  return { gradeFormat, loaded, setGradeFormat };
}
