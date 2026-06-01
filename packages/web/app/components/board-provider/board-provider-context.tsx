'use client';

// Web BoardProvider. Mounts the platform adapter (auth, GraphQL clients,
// persistent-session, snackbar, tick-draft cleanup) and then delegates to
// the shared BoardProvider in `@boardsesh/board-react`. The data surface
// (logbook, saveTick, saveClimb, updateClimb) is implemented once in the
// shared package; this file is only the web-side wiring.

import type { ReactNode } from 'react';
import {
  BoardProvider as SharedBoardProvider,
  useBoardProvider as useSharedBoardProvider,
  useOptionalBoardProvider as useSharedOptionalBoardProvider,
  BoardContext,
  type BoardContextType as SharedBoardContextType,
} from '@boardsesh/board-react';
import type { BoardName } from '@/app/lib/types';
import { BoardAdapterWrapper } from './board-adapter';

// Web-side narrowing: web mounts BoardProvider with a concrete
// route-derived BoardName, never null. Consumers can rely on a non-null
// boardName without manual narrowing.
export type BoardContextType = Omit<SharedBoardContextType, 'boardName'> & { boardName: BoardName };

// Re-exports kept stable for existing import sites.
export type {
  SaveTickOptions,
  SaveClimbResponse,
  UpdateClimbResponse,
  TickStatus,
  LogbookEntry,
} from '@boardsesh/board-react';
export { BoardContext };

export function BoardProvider({ boardName, children }: { boardName: BoardName; children: ReactNode }) {
  return (
    <BoardAdapterWrapper>
      <SharedBoardProvider boardName={boardName}>{children}</SharedBoardProvider>
    </BoardAdapterWrapper>
  );
}

export function useBoardProvider(): BoardContextType {
  // Web always mounts BoardProvider with a non-null boardName, so the
  // narrower web context type holds at runtime. Cast at the boundary.
  return useSharedBoardProvider() as BoardContextType;
}

export function useOptionalBoardProvider(): BoardContextType | null {
  return useSharedOptionalBoardProvider() as BoardContextType | null;
}
