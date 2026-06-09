// Thin React context over `useBoardPresence`, so consumers can read the wall's
// "now playing" state anywhere in the tree without prop-drilling. Renderer-
// agnostic — `react` only, no host components.

import { createContext, useContext, type ReactNode } from 'react';
import { useBoardPresence, type UseBoardPresenceResult } from './use-board-presence';
import type { BoardPresenceClient } from './types';

const BoardPresenceContext = createContext<UseBoardPresenceResult | undefined>(undefined);

export function BoardPresenceProvider({
  boardId,
  client,
  children,
}: {
  boardId: number | null;
  client: BoardPresenceClient | null;
  children: ReactNode;
}) {
  // `useBoardPresence` already memoizes its return value, so the context value
  // is stable between renders without an extra `useMemo` here.
  const value = useBoardPresence(boardId, client);
  return <BoardPresenceContext.Provider value={value}>{children}</BoardPresenceContext.Provider>;
}

export function useBoardPresenceContext(): UseBoardPresenceResult {
  const context = useContext(BoardPresenceContext);
  if (context === undefined) {
    throw new Error('useBoardPresenceContext must be used within a BoardPresenceProvider');
  }
  return context;
}

export { BoardPresenceContext };
