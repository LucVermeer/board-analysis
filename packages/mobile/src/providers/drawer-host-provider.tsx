/**
 * DrawerHostProvider mounts PlayDrawer and LogAscentSheet once at the app root
 * and exposes imperative openers via `useDrawerHost()`. This lets the
 * persistent queue control bar (and any screen) open them without each tab
 * having to instantiate its own copy.
 *
 * Default board comes from `useDefaultBoard()`; callers can override via the
 * second arg to `openPlayDrawer` if needed (e.g. opening a climb from a
 * different board context).
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Climb } from '@boardsesh/shared-schema';
import { PlayDrawer, type PlayDrawerHandle } from '../components/play-drawer';
import { LogAscentSheet } from '../components/LogAscentSheet';
import { useDefaultBoard } from '../lib/graphql/hooks';

export type BoardConfig = {
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
};

export type LogAscentInput = {
  climbUuid: string;
  climbName: string;
  boardName: string;
  angle: number;
  isMirror: boolean;
  isBenchmark: boolean;
  layoutId?: number;
  sizeId?: number;
  setIds?: string;
  sessionId?: string | null;
};

type DrawerHostValue = {
  openPlayDrawer: (climb: Climb, boardConfig?: BoardConfig) => void;
  openLogAscent: (input: LogAscentInput) => void;
};

const DrawerHostContext = createContext<DrawerHostValue | null>(null);

export function useDrawerHost(): DrawerHostValue {
  const context = useContext(DrawerHostContext);
  if (!context) throw new Error('useDrawerHost must be used within DrawerHostProvider');
  return context;
}

export function DrawerHostProvider({ children }: { children: ReactNode }) {
  const playDrawerRef = useRef<PlayDrawerHandle>(null);
  const { data: defaultBoard } = useDefaultBoard();
  const [boardConfigOverride, setBoardConfigOverride] = useState<BoardConfig | null>(null);
  const [logAscentInput, setLogAscentInput] = useState<LogAscentInput | null>(null);

  const openPlayDrawer = useCallback((climb: Climb, override?: BoardConfig) => {
    if (override) setBoardConfigOverride(override);
    else setBoardConfigOverride(null);
    // Wait a tick so the boardConfig prop on PlayDrawer is up to date before
    // its imperative open is called. State setters batch; the subsequent
    // open() runs after the render flush.
    requestAnimationFrame(() => playDrawerRef.current?.open(climb));
  }, []);

  const openLogAscent = useCallback((input: LogAscentInput) => {
    setLogAscentInput(input);
  }, []);

  const dismissLogAscent = useCallback(() => setLogAscentInput(null), []);

  const activeBoardConfig: BoardConfig | null = useMemo(() => {
    if (boardConfigOverride) return boardConfigOverride;
    if (!defaultBoard) return null;
    return {
      boardName: defaultBoard.boardType,
      layoutId: defaultBoard.layoutId,
      sizeId: defaultBoard.sizeId,
      setIds: defaultBoard.setIds,
      angle: defaultBoard.angle,
    };
  }, [boardConfigOverride, defaultBoard]);

  const value = useMemo<DrawerHostValue>(() => ({ openPlayDrawer, openLogAscent }), [openPlayDrawer, openLogAscent]);

  return (
    <DrawerHostContext.Provider value={value}>
      {children}
      {activeBoardConfig ? <PlayDrawer ref={playDrawerRef} boardConfig={activeBoardConfig} /> : null}
      {logAscentInput ? (
        <LogAscentSheet
          visible
          onDismiss={dismissLogAscent}
          climbUuid={logAscentInput.climbUuid}
          climbName={logAscentInput.climbName}
          boardName={logAscentInput.boardName}
          angle={logAscentInput.angle}
          isMirror={logAscentInput.isMirror}
          isBenchmark={logAscentInput.isBenchmark}
          layoutId={logAscentInput.layoutId}
          sizeId={logAscentInput.sizeId}
          setIds={logAscentInput.setIds}
          sessionId={logAscentInput.sessionId}
        />
      ) : null}
    </DrawerHostContext.Provider>
  );
}
