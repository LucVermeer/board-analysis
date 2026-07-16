'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { lightTheme, darkTheme } from '@/app/theme/mui-theme';
import { ColorModeContext, type ColorMode } from '@/app/hooks/use-color-mode';
import { getPreference, setPreference } from '@/app/lib/user-preferences-db';
import { COLOR_MODE_MIRROR_KEY } from '@/app/theme/theme-init-script';

const PREFERENCE_KEY = 'colorMode';

// Write-through mirror of the saved mode to localStorage. IndexedDB stays the
// source of truth; this exists only so the pre-paint init script
// (theme-init-script.ts) can read the preference synchronously before first
// paint, which IndexedDB can't be.
function writeColorModeMirror(next: ColorMode): void {
  try {
    // oxlint-disable-next-line no-restricted-globals -- pre-paint theme mirror: IndexedDB cannot be read synchronously before first paint
    localStorage.setItem(COLOR_MODE_MIRROR_KEY, next);
  } catch {
    // Private mode / disabled storage — the init script falls back to matchMedia.
  }
}

export default function ColorModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ColorMode>('dark');

  useEffect(() => {
    // The pre-paint init script already set data-theme on <html> before first
    // paint. Sync React state from that attribute now — before the async
    // IndexedDB read resolves — so the MUI theme catches up at first effect
    // instead of after an IndexedDB round-trip.
    const prepaintTheme = document.documentElement.getAttribute('data-theme');
    if (prepaintTheme === 'light' || prepaintTheme === 'dark') {
      setMode((prev) => (prev === prepaintTheme ? prev : prepaintTheme));
    }

    // IndexedDB is the source of truth. When it has a saved mode, apply it and
    // refresh the mirror — this seeds existing users whose saved preference
    // predates the mirror.
    void getPreference<ColorMode>(PREFERENCE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setMode(saved);
        document.documentElement.setAttribute('data-theme', saved);
        writeColorModeMirror(saved);
      }
    });
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next: ColorMode = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      void setPreference(PREFERENCE_KEY, next);
      writeColorModeMirror(next);
      return next;
    });
  }, []);

  const contextValue = useMemo(() => ({ mode, toggleMode }), [mode, toggleMode]);
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ColorModeContext.Provider value={contextValue}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <CssBaseline />
          {children}
        </LocalizationProvider>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
