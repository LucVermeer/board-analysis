// Thin React context over `useBoardPresence`, so consumers can read the wall's
// "now playing" state anywhere in the tree without prop-drilling. Renderer-
// agnostic — `react` only, no host components.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  useBoardPresence,
  type BoardPresenceActions,
  type BoardPresenceCurrentState,
  type BoardPresenceFeedState,
  type UseBoardPresenceResult,
} from './use-board-presence';
import type { BoardPresenceClient } from './types';

const BoardPresenceContext = createContext<UseBoardPresenceResult | undefined>(undefined);
const BoardPresenceActionsContext = createContext<BoardPresenceActions | undefined>(undefined);
const BoardPresenceCurrentContext = createContext<BoardPresenceCurrentState | undefined>(undefined);
const BoardPresenceFeedContext = createContext<BoardPresenceFeedState | undefined>(undefined);

export function BoardPresenceProvider({
  boardId,
  client,
  children,
}: {
  boardId: number | null;
  client: BoardPresenceClient | null;
  children: ReactNode;
}) {
  const value = useBoardPresence(boardId, client);
  const actions = useMemo<BoardPresenceActions>(
    () => ({
      reportClimb: value.reportClimb,
      reportClimbWithUndoTarget: value.reportClimbWithUndoTarget,
      getUndoTarget: value.getUndoTarget,
    }),
    [value.reportClimb, value.reportClimbWithUndoTarget, value.getUndoTarget],
  );
  const current = useMemo<BoardPresenceCurrentState>(
    () => ({
      currentClimb: value.currentClimb,
      previousClimb: value.previousClimb,
      undoTarget: value.undoTarget,
      isLive: value.isLive,
    }),
    [value.currentClimb, value.previousClimb, value.undoTarget, value.isLive],
  );
  const feed = useMemo<BoardPresenceFeedState>(
    () => ({
      history: value.history,
      stats: value.stats,
    }),
    [value.history, value.stats],
  );

  return (
    <BoardPresenceContext.Provider value={value}>
      <BoardPresenceActionsContext.Provider value={actions}>
        <BoardPresenceCurrentContext.Provider value={current}>
          <BoardPresenceFeedContext.Provider value={feed}>{children}</BoardPresenceFeedContext.Provider>
        </BoardPresenceCurrentContext.Provider>
      </BoardPresenceActionsContext.Provider>
    </BoardPresenceContext.Provider>
  );
}

export function useBoardPresenceContext(): UseBoardPresenceResult {
  const context = useContext(BoardPresenceContext);
  if (context === undefined) {
    throw new Error('useBoardPresenceContext must be used within a BoardPresenceProvider');
  }
  return context;
}

export function useBoardPresenceActions(): BoardPresenceActions {
  const context = useContext(BoardPresenceActionsContext);
  if (context === undefined) {
    throw new Error('useBoardPresenceActions must be used within a BoardPresenceProvider');
  }
  return context;
}

export function useBoardPresenceCurrent(): BoardPresenceCurrentState {
  const context = useContext(BoardPresenceCurrentContext);
  if (context === undefined) {
    throw new Error('useBoardPresenceCurrent must be used within a BoardPresenceProvider');
  }
  return context;
}

export function useBoardPresenceFeed(): BoardPresenceFeedState {
  const context = useContext(BoardPresenceFeedContext);
  if (context === undefined) {
    throw new Error('useBoardPresenceFeed must be used within a BoardPresenceProvider');
  }
  return context;
}

export { BoardPresenceContext, BoardPresenceActionsContext, BoardPresenceCurrentContext, BoardPresenceFeedContext };
