import { useCallback, useEffect, useState } from 'react';
import { getLastUsedGrade, setLastUsedGrade } from '@/app/lib/user-preferences-db';

/**
 * Reads the last grade the user picked from IndexedDB on mount and exposes a
 * `rememberGrade` callback that persists subsequent picks. Used to focus
 * grade pickers on a familiar grade when they mount unselected.
 */
export function useLastUsedGrade() {
  const [lastUsedGrade, setLastUsedGradeState] = useState<number | undefined>(undefined);

  useEffect(() => {
    void getLastUsedGrade().then((value) => {
      if (value !== undefined) setLastUsedGradeState(value);
    });
  }, []);

  const rememberGrade = useCallback((difficultyId: number | undefined) => {
    if (difficultyId === undefined) return;
    setLastUsedGradeState(difficultyId);
    void setLastUsedGrade(difficultyId);
  }, []);

  return { lastUsedGrade, rememberGrade };
}
