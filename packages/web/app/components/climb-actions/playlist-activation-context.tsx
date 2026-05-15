'use client';

import React, { createContext, useContext } from 'react';
import type { Climb } from '@/app/lib/types';

type PlaylistActivationContextValue = {
  activatePlaylistClimb: (climb: Climb) => Promise<void>;
};

const PlaylistActivationContext = createContext<PlaylistActivationContextValue | null>(null);

export function PlaylistActivationProvider({
  value,
  children,
}: {
  value: PlaylistActivationContextValue;
  children: React.ReactNode;
}) {
  return <PlaylistActivationContext.Provider value={value}>{children}</PlaylistActivationContext.Provider>;
}

export function useOptionalPlaylistActivation(): PlaylistActivationContextValue | null {
  return useContext(PlaylistActivationContext);
}
